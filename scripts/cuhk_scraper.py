import gc
import logging
import os
import re
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, NoReturn

import ddddocr
import onnxruntime
import requests
from bs4 import BeautifulSoup, Tag
from data_utils import (
    NO_TERMS_DIR,
    SCHEMA_VERSION,
    SCRAPE_TIME_FILENAME,
    clean_html_text,
    format_duration_human,
    html_to_clean_markdown,
    load_progress_file,
    parse_enrollment_status_from_image,
    partition_subject_by_year,
    save_json_with_newline,
    utc_now_iso,
    utc_to_hkt,
)
from requests.exceptions import ChunkedEncodingError, ConnectionError, HTTPError, Timeout

# The Class Details status: both the value we record and the sentinel that the response
# is a class details page at all. Absent from every other page CUHK serves.
CLASS_STATUS_FIELD = "uc_class_lbl_class_status"

# Lab/debug outputs
SCRAPER_OUTPUTS_DIR = os.path.join("lab", "scraper", "outputs")
DEBUG_HTML_DIR = os.path.join(SCRAPER_OUTPUTS_DIR, "debug_html")
TEST_PROGRESS_FILE = os.path.join(SCRAPER_OUTPUTS_DIR, "scraping_progress.json")

# Course data outputs
SOURCE_DATA_DIR = "data"

# Operational logs and summaries
LOGS_DIR = "logs"
SCRAPE_LOG_DIR = os.path.join(LOGS_DIR, "scrape")
# Pages behind a failure outside debug mode, one folder per run named after its log
ERROR_PAGES_DIR = os.path.join(LOGS_DIR, "error_pages")
SCRAPING_PROGRESS_FILE = os.path.join(LOGS_DIR, "scraping_progress.json")


@dataclass
class ScrapingConfig:
    """Configuration for testing vs production scraping"""

    # Testing defaults - safe for development
    max_courses_per_subject: int | None = 3  # None = unlimited
    save_debug_files: bool = True  # Save HTML files for debugging
    save_debug_on_error: bool = True  # Always save HTML when parsing fails
    debug_html_directory: str = DEBUG_HTML_DIR  # Separate from JSON results
    # Seconds between every request, retries included. Production uses 0.8; going much lower invites hardening (tougher captcha, a WAF) that breaks this scraper permanently — nobody wins. Rationale: "Request Pacing" in docs/data-pipeline.md.
    request_delay: float = 1.0
    max_subject_attempts: int = 5
    # Wrong reads are routine and cost only a new captcha. This many in a row means the
    # OCR can no longer read it, so the run stops.
    max_captcha_attempts: int = 20
    # Transient corruption clears on the next attempt; this many identical parse failures
    # means the page shape changed and no amount of retrying will parse it.
    max_course_attempts: int = 5
    # 97% of real transients clear within two attempts. Past six it is a wedged session,
    # which only the subject scope can fix by rebuilding it.
    max_request_attempts: int = 6
    output_directory: str = SCRAPER_OUTPUTS_DIR  # testing default
    track_progress: bool = False  # Progress tracking for production
    # Progress log filename (use os.path.join for production)
    progress_file: str = TEST_PROGRESS_FILE

    # Scraping scope configuration
    get_details: bool = False  # Get detailed course information beyond basic listings
    get_enrollment_details: bool = False  # Get section-level enrollment numbers and availability
    get_course_outcome: bool = (
        False  # Get Course Outcome page data (learning outcomes, assessments, etc.)
    )

    @classmethod
    def for_production(cls):
        """Production-ready configuration - unlimited courses, optimized performance"""
        return cls(
            max_courses_per_subject=None,  # No limit
            save_debug_files=False,  # No debug files in production
            save_debug_on_error=True,  # Keep the page behind a failure, nothing else
            debug_html_directory=DEBUG_HTML_DIR,  # Separate debug folder
            request_delay=0.8,  # ~9h for a full scrape at today's catalog size
            max_subject_attempts=10,
            output_directory=SOURCE_DATA_DIR,  # Production data directory
            track_progress=True,  # Enable progress tracking
            progress_file=SCRAPING_PROGRESS_FILE,
            # Full scraping scope for production
            get_details=True,
            get_enrollment_details=True,
            get_course_outcome=True,  # Include Course Outcome data for comprehensive course information
        )


@dataclass
class TermInfo:
    """Term-specific course information"""

    term_code: str  # e.g., "2390"
    term_name: str  # e.g., "2025-26 Term 2"
    # TODO(#329): a section is the only record with no definition, so the two parsers
    # that build one can disagree without anything noticing.
    schedule: list[dict]  # List of sections with detailed availability/meetings

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Course:
    """Course data structure with multiple terms support"""

    subject: str
    course_code: str
    title: str
    credits: str
    terms: list[TermInfo]  # List of terms this course is offered
    postback_target: str = ""  # For getting detailed info
    # Where CUSIS kept returning its system error, so that part of the course is empty.
    unavailable: list[str] = field(default_factory=list)

    # Additional course details
    description: str = ""
    enrollment_requirement: str = ""
    course_attributes: str = (
        ""  # e.g., "Virtual Teaching & Learning Course", "Service-Learning Course"
    )
    academic_career: str = ""  # e.g., "Undergraduate"
    # Note: class_attributes are section-specific and stored in each section's data within schedule
    grading_basis: str = ""  # e.g., "Graded"
    component: str = ""  # e.g., "Lecture\nInteractive Tutorial"
    campus: str = ""  # e.g., "Main Campus"
    academic_group: str = ""  # e.g., "Dept of Computer Sci & Engg"
    academic_org: str = ""  # e.g., "Dept of Computer Sci & Engg"

    # Course Outcome details (optional, scraped from Course Outcome page)
    learning_outcomes: str = ""  # Learning objectives and outcomes
    course_syllabus: str = ""  # Course syllabus (might be same as description)
    assessment_types: dict[str, str] = field(
        default_factory=dict
    )  # {"Presentation": "20", "Project": "30", ...}
    feedback_evaluation: str = ""  # Feedback for evaluation
    required_readings: str = ""  # Required reading materials
    recommended_readings: str = ""  # Recommended reading materials

    def to_dict(self) -> dict:
        data = asdict(self)
        # Remove postback_target from exported data
        data.pop("postback_target", None)
        data.pop("unavailable", None)
        # Convert terms to dict format
        data["terms"] = [term.to_dict() for term in self.terms]
        return data


# One nightly cycle: past this, the drift a resume cannot see is worth saying out loud.
RESUME_AGE_LIMIT = timedelta(hours=24)


class NothingToResume(Exception):
    """--resume found no unfinished full scrape."""


def load_latest_full_scrape(progress_file: str) -> dict | None:
    """The recorded full scrape, or None. Read before the tracker exists, for --resume."""
    data = load_progress_file(progress_file)
    return data.get("latest_full_scrape") if data else None


def render_output_files(output_files: list[str]) -> str:
    """What a subject wrote, for a reader. An empty subject legitimately writes nothing."""
    return ", ".join(output_files) or "(no file — empty subject)"


class ScrapingProgressTracker:
    """Tracks scraping progress for production runs with resume capability

    The progress file holds three blocks, shortest-lived first. `latest_run` reports one
    invocation, from run state held here. `latest_full_scrape` reports one scrape of the
    whole catalog, which may span several runs. `subjects` is the cumulative registry of
    what is on disk, and outlives both.

    It records; the scrape loop narrates. Each subject is announced there, where the
    count, the duration and the files are.
    """

    def __init__(
        self,
        progress_file: str,
        logger: logging.Logger,
        run_subjects: list[str],
        config: "ScrapingConfig",
        mode: str,
    ):
        self.progress_file = progress_file
        self.logger = logger
        # Run state: never loaded from the file, so it can only describe this run.
        self.run_subjects = run_subjects
        self.config = config
        self.mode = mode
        self._started_at = utc_to_hkt()
        self._started_monotonic = time.monotonic()
        self._run_status = "in_progress"
        self._subject_statuses: dict[str, str] = {}
        self.progress_data, existing_scrape = self._load_progress()
        self.latest_full_scrape = self._open_scrape(existing_scrape)
        # On disk before the first search, so a run stopped there leaves this scrape for
        # --resume rather than the previous one.
        self._save_progress()

    def _load_progress(self) -> tuple[dict, dict | None]:
        """Load the subject registry and the last full scrape; run state is always fresh"""
        data = load_progress_file(self.progress_file) or {}

        # Preserve existing subject data (so we don't lose completed subjects)
        existing_subjects = data.get("subjects", {})
        if existing_subjects:
            self.logger.info(f"Preserved data for {len(existing_subjects)} existing subjects")

        return {"subjects": existing_subjects}, data.get("latest_full_scrape")

    def _open_scrape(self, existing: dict | None) -> dict | None:
        """The full scrape this run belongs to.

        A partial run belongs to none and a resume to the recorded one, so neither starts
        a new scrape.
        """
        if self.mode in ("partial", "resume"):
            return existing
        return {
            "started_at": utc_now_iso(),
            "remaining": list(self.run_subjects),
            "directories": [],
        }

    def _run_block(self) -> dict:
        """Render this run's dashboard

        Written for a human and never read back, which is why it carries HKT timestamps
        and no machine-readable siblings. `run_summary` renders it too, so the counts on
        the console come from this one source; its timestamps are rendered per call.
        """
        subject_statuses = list(self._subject_statuses.values())
        return {
            "started_at": self._started_at,
            "last_updated": utc_to_hkt(),
            "duration": format_duration_human(int(time.monotonic() - self._started_monotonic)),
            # A process cannot record its own death, so "in_progress" means running or
            # crashed. `last_updated` moves once per subject; logs/scrape/ is what shows
            # whether a run is still alive.
            "status": self._run_status,
            # Which counts these are: a partial run naming every subject looks the same.
            "mode": self.mode,
            "subjects_total": len(self.run_subjects),
            "subjects_completed": subject_statuses.count("completed"),
            "subjects_incomplete": subject_statuses.count("incomplete"),
            "subjects_failed": subject_statuses.count("failed"),
            # What the numbers above were produced under: a run that skipped details or
            # capped courses per subject explains data that looks thin.
            "config": {
                "get_details": self.config.get_details,
                "get_enrollment_details": self.config.get_enrollment_details,
                "max_courses": self.config.max_courses_per_subject,
            },
        }

    def _save_progress(self):
        """Save current progress to file"""
        try:
            # Ensure directory exists (only if there's a directory path)
            dir_path = os.path.dirname(self.progress_file)
            if dir_path:  # Only create directory if path contains a directory
                os.makedirs(dir_path, exist_ok=True)

            # Sorted here rather than via json.dump(sort_keys=True), which would sort
            # recursively and alphabetize latest_run's fields too.
            subjects = dict(sorted(self.progress_data["subjects"].items()))
            saved = {"latest_run": self._run_block()}
            if self.latest_full_scrape is not None:
                saved["latest_full_scrape"] = self.latest_full_scrape
            saved["subjects"] = subjects
            save_json_with_newline(self.progress_file, saved)

            self.logger.debug(f"Progress saved to {self.progress_file}")
        except Exception as e:
            self.logger.error(f"Could not save progress: {e}")

    def start_subject(self, subject: str):
        """Mark subject as started.

        The entry lasts until the subject completes or fails, so what it records is that
        a run died here — enough for publishing to block on, and for --resume to redo it.
        """
        subjects = self.progress_data["subjects"]
        subjects[subject] = {"status": "in_progress", "started_at": utc_now_iso()}
        self._save_progress()

    def complete_subject(
        self,
        subject: str,
        courses_count: int,
        output_files: list[str],
        *,
        unavailable: Sequence[str] = (),
    ):
        """Mark subject as saved: "incomplete" if `unavailable` lists parts CUSIS kept
        erroring on, otherwise "completed"."""
        entry = {
            "status": "incomplete" if unavailable else "completed",
            "courses_count": courses_count,
            "output_file": render_output_files(output_files),
        }
        if unavailable:
            entry["unavailable"] = list(unavailable)
        self.progress_data["subjects"][subject] = entry

        self._record_scrape_progress(subject, output_files)
        self._subject_statuses[subject] = entry["status"]
        self._save_progress()

    def fail_subject(self, subject: str, error_message: str):
        """Mark subject as failed"""
        subjects = self.progress_data["subjects"]
        subjects[subject] = {
            "status": "failed",
            "last_attempt": utc_now_iso(),
            "error": str(error_message)[:200],  # Limit error message length
        }

        self._record_scrape_progress(subject, [])
        self._subject_statuses[subject] = "failed"
        self._save_progress()

    def finish_run(self):
        """Mark the run finished

        Nothing else writes `status`, so an interrupted or killed run correctly leaves it
        at "in_progress".
        """
        self._run_status = "completed"
        self._save_progress()

    def _record_scrape_progress(self, subject: str, output_files: list[str]):
        """Take the subject off the scrape's to-do list and note where it wrote.

        Attempted, not succeeded, so one subject CUHK drops cannot keep every scrape
        unfinished. An empty `remaining` is what says the scrape finished.
        """
        if self.mode == "partial" or self.latest_full_scrape is None:
            return

        remaining = self.latest_full_scrape["remaining"]
        if subject in remaining:
            remaining.remove(subject)

        directories = set(self.latest_full_scrape["directories"])
        directories.update(Path(path).parent.as_posix() for path in output_files)
        self.latest_full_scrape["directories"] = sorted(directories)

    def get_failed_subjects(self) -> list[str]:
        """Get the subjects this run failed, for summary/retry purposes"""
        return self._subjects_with_status("failed")

    def _subjects_with_status(self, status: str) -> list[str]:
        return [subject for subject, seen in self._subject_statuses.items() if seen == status]

    def run_summary(self) -> str:
        """This run's tally, for the line that closes the run."""
        run = self._run_block()
        summary = (
            f"{run['subjects_completed']} of {run['subjects_total']} subjects in {run['duration']}"
        )

        # Each its own line: the list is as long as the run was bad.
        for status in ("incomplete", "failed"):
            if subjects := self._subjects_with_status(status):
                summary += f"\n    {len(subjects)} {status}: {', '.join(subjects)}"
        return summary


# How a scrape line looks, wherever it is shown. The formatter below fills `level_icon`
# and the filter fills `context`, empty outside a scrape. The level is padded so the
# names line up into a column.
SCRAPE_LOG_FORMAT = "%(asctime)s - %(level_icon)s %(levelname)-7s - %(context)s%(message)s"


def _level_icon(levelno: int) -> str:
    """A glyph for the levels worth spotting. INFO is ~99% of a run, so it gets none."""
    if levelno >= logging.ERROR:
        return "🔴"
    if levelno >= logging.WARNING:
        return "🟡"
    return "  "  # an emoji's width, so the column holds


class _ScrapeLogFormatter(logging.Formatter):
    """Fills `level_icon` from the record, so the glyph cannot disagree with the level."""

    def format(self, record: logging.LogRecord) -> str:
        record.level_icon = _level_icon(record.levelno)
        return super().format(record)


def scrape_log_formatter() -> logging.Formatter:
    """The scrape line format, for a handler that shows scrape output."""
    return _ScrapeLogFormatter(SCRAPE_LOG_FORMAT, defaults={"context": ""})


class _ScrapeContextFilter(logging.Filter):
    """Attach the scraper's subject and course to each record.

    A Filter is the stdlib hook for enriching records; nothing is dropped here.
    """

    def __init__(self, scraper: "CuhkScraper"):
        super().__init__()
        self.scraper = scraper

    def filter(self, record: logging.LogRecord) -> bool:
        subject, course = self.scraper.current_subject, self.scraper.current_course_code
        if subject and course:
            record.context = f"[{subject}{course}] "
        else:
            record.context = f"[{subject}] " if subject else ""
        return True


def show_scrape_context(scraper: "CuhkScraper", handlers: list[logging.Handler]) -> None:
    """Have these handlers name the subject and course each line came from.

    The console and the log file show the same lines, so both are set up here rather
    than each deciding for itself.
    """
    for handler in handlers:
        handler.addFilter(_ScrapeContextFilter(scraper))
        handler.setFormatter(scrape_log_formatter())


class CatalogResponseError(ValueError):
    """CUSIS returned a page the scraper cannot use. The page has already been saved."""

    def __init__(self, problem: str, where: str):
        super().__init__(f"{problem} at {where}")
        self.where = where


class CatalogSystemError(CatalogResponseError):
    """CUSIS returned its "System error" page."""


class CaptchaNotAccepted(RuntimeError):
    """No captcha read was accepted within `max_captcha_attempts`."""


# Every catalog page carries the form state the next postback must send back.
_FORM_STATE = re.compile(r'name="__VIEWSTATE"')
_SYSTEM_ERROR_TITLE = re.compile(r"<title>\s*System error\s*</title>", re.IGNORECASE)
# CUHK's captcha never uses I, O or 0 (none in 3,013 accepted codes).
_CAPTCHA_CODE = re.compile(r"[A-HJ-NP-Z1-9]{4}")


class CuhkScraper:
    """Simplified CUHK course scraper"""

    # Class-level so every instance starts unpaced — including test doubles, which are built with __new__ and never run __init__.
    _last_request_at: float | None = None

    # The live catalog, code -> title. Class-level for the same reason, and always
    # replaced rather than mutated.
    subject_titles_cache: dict[str, str] = {}

    def __init__(self, config: ScrapingConfig | None = None):
        self.session = self._new_session()
        self.logger = logging.getLogger(__name__)
        self.base_url = (
            "http://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx"
        )
        self.progress_tracker: ScrapingProgressTracker | None = None

        # Primary configuration for this scraper instance
        self.config = config or ScrapingConfig()

        # What the scraper is on, for debug filenames and log prefixes. Before logging
        # setup, which logs a line the context filter reads these for.
        self.current_subject: str | None = None
        self.current_course_code: str | None = None

        # Set up file logging automatically
        log_path = self._setup_file_logging()
        self.error_pages_dir = os.path.join(ERROR_PAGES_DIR, Path(log_path).stem)

        # Suppress ONNX warnings
        onnxruntime.set_default_logger_severity(3)
        self.ocr = ddddocr.DdddOcr()

        # Network resilience settings
        self._request_timeout = (10, 30)  # (connect, read) timeouts in seconds

    @staticmethod
    def _new_session() -> requests.Session:
        """A session with our browser headers and no cookies of its own."""
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Connection": "keep-alive",
            }
        )
        return session

    def _wait_for_request_slot(self) -> None:
        """Hold requests to one per `request_delay` seconds.

        Sleeps only the remainder, so time already spent on the previous request counts
        toward the interval instead of stacking on top of it.
        """
        if self._last_request_at is not None:
            remaining = self.config.request_delay - (time.monotonic() - self._last_request_at)
            if remaining > 0:
                time.sleep(remaining)
        self._last_request_at = time.monotonic()

    def _robust_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        Robust HTTP request with bounded retry for network issues

        Args:
            method: 'GET' or 'POST'
            url: URL to request
            **kwargs: Additional arguments for requests (data, params, etc.)

        Returns:
            Response object

        Note:
            Retries network errors (ConnectionError, ChunkedEncodingError, Timeout) and HTTP
            502/503/504 up to max_request_attempts times, then re-raises so the caller redoes
            the unit. Any other HTTP status raises immediately.
        """
        # Set default timeout if not provided
        if "timeout" not in kwargs:
            kwargs["timeout"] = self._request_timeout

        attempt = 0
        while True:
            self._wait_for_request_slot()
            try:
                # Make the request
                if method.upper() == "GET":
                    response = self.session.get(url, **kwargs)
                elif method.upper() == "POST":
                    response = self.session.post(url, **kwargs)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                # Check for HTTP errors
                response.raise_for_status()

                # With no charset in the header, requests falls back to Latin-1. CUSIS's
                # error page names none, and every CUSIS page is UTF-8.
                if "charset=" not in response.headers.get("Content-Type", "").lower():
                    response.encoding = "utf-8"

                return response

            # ChunkedEncodingError is a body that stopped early. Named separately because it
            # is not a subclass of requests' ConnectionError.
            except (ConnectionError, ChunkedEncodingError, Timeout) as e:
                attempt += 1
                if attempt >= self.config.max_request_attempts:
                    self.logger.error(f"Network issue after {attempt} attempts, giving up: {e}")
                    raise
                # Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
                wait_time = min(60, 1.0 * (2 ** (attempt - 1)))
                self.logger.warning(
                    f"Network issue (attempt {attempt}), retrying in {wait_time}s: {e}"
                )
                time.sleep(wait_time)

            except HTTPError as e:
                # An HTTPError can carry no response; dereferencing it would replace the
                # original error with an AttributeError.
                status = e.response.status_code if e.response is not None else None
                if status in [502, 503, 504]:  # Server errors - retry
                    attempt += 1
                    if attempt >= self.config.max_request_attempts:
                        self.logger.error(
                            f"Server error {status} after {attempt} attempts, giving up"
                        )
                        raise
                    wait_time = min(60, 1.0 * (2 ** (attempt - 1)))  # Exponential backoff, max 60s
                    self.logger.warning(
                        f"Server error {status} (attempt {attempt}), retrying in {wait_time}s"
                    )
                    time.sleep(wait_time)
                else:
                    # Repeating an identical 4xx won't help — it usually means stale
                    # session or form state, which only the caller can rebuild by redoing
                    # the whole unit. Escalate rather than hammer the same request.
                    self.logger.error(f"HTTP error {status}: {e}")
                    raise

    def _setup_file_logging(
        self,
        logs_directory: str = SCRAPE_LOG_DIR,
        log_level: int = logging.INFO,
    ) -> str:
        """
        Set up file logging for the scraper with timestamped log files.
        Called automatically during scraper initialization.

        Args:
            logs_directory: Directory to store verbose log files (default: "logs/scrape")
            log_level: Logging level (default: logging.INFO)

        Returns:
            str: Path to the created log file
        """
        # Create logs directory if it doesn't exist
        os.makedirs(logs_directory, exist_ok=True)

        # Create timestamped log filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_filename = os.path.join(logs_directory, f"scrape_{timestamp}.log")

        # Add file handler to the existing logger
        file_handler = logging.FileHandler(log_filename, encoding="utf-8")
        file_handler.setLevel(log_level)

        show_scrape_context(self, [file_handler])

        # Add handler to logger (keeps existing console output)
        self.logger.addHandler(file_handler)
        self.logger.setLevel(log_level)

        self.logger.info(f"File logging initialized: {log_filename}")
        return log_filename

    # What the scraper is on, for debug filenames. Scopes nest run -> subject -> course
    # and are entered by the method that owns each, so nothing can outlive its block and
    # file the next subject's pages under the last one's name.

    @contextmanager
    def _subject_scope(self, subject: str) -> Iterator[None]:
        """One subject, from its first request to its last."""
        self.current_subject = subject
        try:
            yield
        finally:
            self.current_subject = None
            self.current_course_code = None

    @contextmanager
    def _course_scope(self, course: Course) -> Iterator[None]:
        """One course within the enclosing subject, which keeps owning the subject."""
        self.current_course_code = course.course_code
        try:
            yield
        finally:
            self.current_course_code = None

    def _extract_asp_hidden_fields(self, soup: BeautifulSoup) -> dict[str, str]:
        """
        Extract ASP.NET hidden form fields (ViewState, EventValidation, etc.)

        ASP.NET Web Forms uses hidden fields to maintain state between postbacks.
        This method extracts all hidden fields required for form submissions.

        Args:
            soup: Parsed BeautifulSoup object

        Returns:
            Dictionary of hidden field names to values
        """
        form_data = {}

        for input_elem in soup.find_all("input", {"type": "hidden"}):
            name = input_elem.get("name")
            value = input_elem.get("value", "")
            if name:
                form_data[name] = value

        return form_data

    def _save_debug_html(self, content: str, filename: str, force_save: bool = False) -> None:
        """Save every page in debug mode; otherwise only one behind a failure, in this
        run's folder under logs/error_pages/."""
        if self.config.save_debug_files:
            directory = self.config.debug_html_directory
        elif force_save and self.config.save_debug_on_error:
            directory = self.error_pages_dir
        else:
            return

        os.makedirs(directory, exist_ok=True)
        debug_path = os.path.join(directory, filename)
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(content)
        self.logger.info(f"Saved debug HTML: {debug_path}")

    def _request_catalog_html(
        self, method: str, *, stage: str, target: str = "", **kwargs
    ) -> requests.Response:
        """Request a catalog page. Rejects a page without form state, so even an
        unfamiliar error page fails instead of parsing as empty."""
        response = self._robust_request(method, self.base_url, **kwargs)
        if _FORM_STATE.search(response.text):
            return response
        if _SYSTEM_ERROR_TITLE.search(response.text):
            self._reject_page(
                response.text, "CUSIS system error", stage, target, CatalogSystemError
            )
        self._reject_page(response.text, "CUSIS page without form state", stage, target)

    def _reject_page(
        self,
        html: str,
        problem: str,
        stage: str,
        target: str = "",
        error: type[CatalogResponseError] = CatalogResponseError,
    ) -> NoReturn:
        """Save the page CUSIS returned, then raise naming where the scrape was."""
        subject, code = self.current_subject or "", self.current_course_code or ""
        where = " ".join(filter(None, (stage, subject + code, target)))
        kind = "SYSTEM_ERROR" if error is CatalogSystemError else "INVALID"
        # Cleaned part by part, so "(9978)" at the end of a part leaves no stray "_".
        parts = (
            re.sub(r"[^A-Za-z0-9_-]+", "_", part).strip("_")
            for part in (stage, subject + code, target, kind)
        )
        filename = "_".join(filter(None, parts)) + ".html"
        self._save_debug_html(html, filename, force_save=True)
        raise error(problem, where)

    def _check_course_page(
        self,
        soup: BeautifulSoup,
        html: str,
        course: Course,
        *,
        stage: str,
        term_code: str = "",
        term_name: str = "",
    ) -> None:
        """Reject a page for another course, or a term page showing another term."""
        header = self._extract_course_header_info(soup)
        shown = " ".join(header[:2]) if header else "no course"
        requested = f"{course.subject} {course.course_code.strip('()')}"
        if shown != requested:
            self._reject_page(html, f"Page shows {shown}, not {requested}", stage, term_name)

        if term_code:
            term_select = "#uc_course_ddl_class_term option[selected]"
            selected = [option.get("value") for option in soup.select(term_select)]
            if selected != [term_code]:
                self._reject_page(
                    html, f"Page selects term {selected}, not {term_code}", stage, term_name
                )

    def _solve_captcha(self, image_bytes: bytes) -> str | None:
        """Solve captcha using ddddocr"""
        try:
            # ddddocr.classification() returns a string, but type checker doesn't know this
            raw_result = self.ocr.classification(image_bytes)
            text = str(raw_result).strip().upper()

            if _CAPTCHA_CODE.fullmatch(text):
                self.logger.info(f"OCR produced: {text} (awaiting server validation)")
                return text
            else:
                # Re-solved on the next attempt; only running out of them is a failure.
                self.logger.info(f"Invalid OCR format: '{text}' (not a possible captcha code)")

        except Exception as e:
            self.logger.error(f"OCR processing failed: {e}")

        return None

    def _classify_search_result(self, response_html: str) -> dict:
        """Classify CUHK's reply to a search, with the message it showed, if any.

        Logs before 2026-09 call `captcha_failed_form_redisplayed` `captcha_failed_no_table`.
        """
        soup = BeautifulSoup(response_html, "html.parser")

        error_span = soup.find("span", {"id": "lbl_error", "class": "errorLabel"})
        error_text = error_span.get_text(strip=True) if error_span else ""
        if error_text:
            if "Invalid Verification Code" in error_text:
                return {"result_type": "captcha_failed", "error_message": error_text}
            return {"result_type": "server_error", "error_message": error_text}

        results_table = soup.find("table", {"id": "gv_detail"})
        if not results_table:
            # The search form again, with no message, is also a wrong code.
            if soup.find("input", {"name": "txt_captcha"}):
                return {"result_type": "captcha_failed_form_redisplayed", "error_message": None}
            return {"result_type": "unknown_error", "error_message": None}

        empty_row = results_table.find("tr", class_="normalGridViewEmptyDataRowStyle")
        if empty_row and "No record found" in empty_row.get_text(strip=True):
            return {"result_type": "no_records", "error_message": None}

        if results_table.find_all("a", {"id": lambda x: x and "lbtn_course_nbr" in x}):
            return {"result_type": "has_courses", "error_message": None}

        return {"result_type": "empty_unclear", "error_message": None}

    def get_subjects_from_live_site(self) -> list[str]:
        """Subject codes from the live website. Raises like the titled fetch it delegates to."""
        return [subject["code"] for subject in self.get_subjects_with_titles_from_live_site()]

    def get_subjects_with_titles_from_live_site(self) -> list[dict[str, str]]:
        """Subject codes and titles from the live site, cached on the scraper.

        Fetched once per run: the runner and the scrape both ask for it.

        Raises rather than returning nothing: an empty result would blank every subject
        title, and the run would look fine.
        """
        if self.subject_titles_cache:
            return [
                {"code": code, "title": title} for code, title in self.subject_titles_cache.items()
            ]

        response = self._request_catalog_html("GET", stage="subject_list")
        soup = BeautifulSoup(response.text, "html.parser")
        select = soup.find("select", {"name": "ddl_subject"})
        if not select:
            raise ValueError("Subject dropdown (ddl_subject) missing from the live site")

        subjects = []
        for option in select.find_all("option"):
            value = option.get("value", "").strip()
            text = option.get_text().strip()
            if value and text:  # Skip empty options
                subjects.append({"code": value, "title": text})
        if not subjects:
            raise ValueError("Subject dropdown (ddl_subject) held no titled subjects")

        self.subject_titles_cache = {s["code"]: s["title"] for s in subjects}
        self.logger.info(f"Found {len(subjects)} subjects with titles from live site")
        return subjects

    def scrape_subject(self, subject_code: str) -> list[Course]:
        """Scrape courses for a specific subject"""
        with self._subject_scope(subject_code):
            for attempt in range(self.config.max_subject_attempts):
                try:
                    self.logger.info(f"Fetching course list, attempt {attempt + 1}")
                    response, result = self._search_subject(subject_code)

                    # Debug: save response to understand structure (using smart saving)
                    self._save_debug_html(
                        response.text, f"response_{subject_code}_attempt_{attempt + 1}.html"
                    )

                    # Parse results
                    courses = self._parse_course_list(response.text)

                    # Set the subject for all courses
                    for course in courses:
                        course.subject = subject_code

                    if self.progress_tracker and self.config.track_progress:
                        self.progress_tracker.start_subject(subject_code)

                    # Get detailed information if requested
                    if self.config.get_details and courses:
                        # Apply course limit based on configuration
                        if self.config.max_courses_per_subject is not None:
                            courses_to_detail = courses[: self.config.max_courses_per_subject]
                            self.logger.info(
                                f"Getting details for {len(courses_to_detail)} courses (limited by config)..."
                            )
                        else:
                            courses_to_detail = courses

                        detailed_courses = []

                        for i, course in enumerate(courses_to_detail):
                            self.logger.info(
                                f"Getting details for course {i + 1}/{len(courses_to_detail)}: {course.course_code}"
                            )
                            detailed_course = self.get_course_details(course, response.text)
                            detailed_courses.append(detailed_course)

                        # Add remaining courses without details for complete list (if limited)
                        if self.config.max_courses_per_subject is not None:
                            detailed_courses.extend(courses[self.config.max_courses_per_subject :])
                        courses = detailed_courses

                    return [] if result == "no_records" else courses

                except CaptchaNotAccepted:
                    raise
                except Exception as e:
                    self.logger.error(f"Attempt {attempt + 1} failed: {e}")
                    if attempt < self.config.max_subject_attempts - 1:
                        # The session itself may be what failed — ASP.NET keeps per-session
                        # state we cannot clear. A new one restarts from a fresh SessionId.
                        self.session = self._new_session()
                        self.logger.info(f"New session after attempt {attempt + 1}")
                        time.sleep(min(60, 2**attempt))  # Exponential backoff, max 60s

            # Returning [] here would be indistinguishable from a subject with no courses,
            # and the caller would record the subject as completed.
            raise RuntimeError(
                f"{subject_code}: no usable results after {self.config.max_subject_attempts} attempts"
            )

    def _search_subject(self, subject_code: str) -> tuple[requests.Response, str]:
        """Submit the subject's search, on a fresh captcha until CUHK accepts one."""
        for attempt in range(1, self.config.max_captcha_attempts + 1):
            form = self._request_catalog_html("GET", stage="subject_form")
            form_data = self._extract_form_data(BeautifulSoup(form.text, "html.parser"))
            if form_data is None:
                continue
            form_data["ddl_subject"] = subject_code
            response = self._request_catalog_html("POST", stage="course_list", data=form_data)

            search = self._classify_search_result(response.text)
            result, said = search["result_type"], search["error_message"]
            described = result + (f" - {said}" if said else "")
            if result in ("has_courses", "no_records"):
                self.logger.info(f"Captcha accepted: {result}")
                return response, result
            if not result.startswith("captcha_failed"):
                # Not a miss: CUHK sent something we don't know, so keep the page.
                self._reject_page(
                    response.text, f"Unrecognized search result: {described}", "course_list"
                )
            self.logger.info(f"Captcha rejected (attempt {attempt}): {described}")

        raise CaptchaNotAccepted(
            f"{subject_code}: no captcha accepted in {self.config.max_captcha_attempts} attempts. "
            "The OCR may no longer read it; check the OCR reads in the log."
        )

    def _extract_form_data(self, soup: BeautifulSoup) -> dict[str, str] | None:
        """The search form's fields with the captcha solved, or None if it was unreadable."""
        form_data = self._extract_asp_hidden_fields(soup)

        captcha_img = soup.find("img", {"id": "imgCaptcha"})
        captcha_url = captcha_img.get("src") if captcha_img else None
        if not captcha_url:
            raise ValueError("Captcha image (imgCaptcha) missing from the search form")
        if not captcha_url.startswith("http"):
            captcha_url = self.base_url.rsplit("/", 1)[0] + "/" + captcha_url

        captcha_text = self._solve_captcha(self._robust_request("GET", captcha_url).content)
        if not captcha_text:
            return None

        form_data["txt_captcha"] = captcha_text
        form_data["btn_search"] = "Search"
        return form_data

    def _parse_course_list(self, html: str) -> list[Course]:
        """Parse the subject's list page into Course stubs: code, title, postback target."""
        soup = BeautifulSoup(html, "html.parser")
        courses = []

        # Look for the specific course results table
        course_table = soup.find("table", {"id": "gv_detail"})
        if not course_table:
            raise ValueError("Course list table (gv_detail) missing from the results page")

        # Data rows only, which skips the header and the "No record found" row: an empty
        # subject has to count zero, not one.
        # TODO(#418): a renamed row class reads as no rows.
        data_rows = course_table.find_all(
            "tr", class_=["normalGridViewRowStyle", "normalGridViewAlternatingRowStyle"]
        )

        for row in data_rows:
            try:
                cells = row.find_all("td")

                if len(cells) >= 2:  # Should have at least course number and title
                    # Extract course number and title from the links
                    course_nbr_link = row.find("a", {"id": lambda x: x and "lbtn_course_nbr" in x})
                    course_title_link = row.find(
                        "a", {"id": lambda x: x and "lbtn_course_title" in x}
                    )

                    if course_nbr_link and course_title_link:
                        course_code = clean_html_text(course_nbr_link.get_text())
                        title = clean_html_text(course_title_link.get_text())

                        # Get the postback target for this course (for details later)
                        postback_target = None
                        href = course_nbr_link.get("href", "")
                        if "__doPostBack(" in href:
                            # Extract target from href like: javascript:__doPostBack('gv_detail$ctl02$lbtn_course_nbr','')
                            start = href.find("'") + 1
                            end = href.find("'", start)
                            if start > 0 and end > start:
                                postback_target = href[start:end]

                        # Create course with basic info
                        course = Course(
                            subject="",  # Will be set by caller
                            course_code=course_code,
                            title=title,
                            credits="",
                            terms=[],  # Will be populated with term details
                        )

                        # Store postback target for potential detail retrieval
                        if postback_target:
                            course.postback_target = postback_target

                        courses.append(course)

            except Exception as e:
                self.logger.warning(f"Error parsing course row: {e}")
                continue

        # The page offered these rows, so a shortfall is a row we lost, not a course CUHK
        # stopped listing. Counting is the only granularity available: a row that fails to
        # parse leaves no course to name or re-fetch on its own.
        if len(courses) != len(data_rows):
            raise ValueError(f"Parsed {len(courses)} courses from {len(data_rows)} course rows")

        self.logger.info(f"Parsed {len(courses)} courses from results table")
        return courses

    def _keep_failed_course_page(self, response, course: Course) -> None:
        """Save the last page CUHK served for this course.

        Not reset per attempt on purpose: when the final attempt dies before getting a
        response, an earlier page is the only evidence left. None when no attempt got
        that far — a 4xx escalates out of `_robust_request` without one.
        """
        if response is None:
            return
        self._save_debug_html(
            response.text,
            f"course_details_{course.subject}_{course.course_code}_FAILED.html",
            force_save=True,
        )

    def get_course_details(self, course: Course, current_html: str) -> Course | None:
        """Get detailed course information by simulating postback with retry for validation failures"""
        with self._course_scope(course):
            if not course.postback_target:
                self.logger.warning("No postback target")
                return course

            # TODO: Extract retry logic if we add more retry sites (see _robust_request for similar pattern)
            attempt = 0
            response = None
            while True:
                try:
                    soup = BeautifulSoup(current_html, "html.parser")

                    # Prepare postback for course details
                    form_data = self._extract_asp_hidden_fields(soup)
                    form_data["__EVENTTARGET"] = course.postback_target
                    form_data["__EVENTARGUMENT"] = ""

                    # Submit the postback to get course details page
                    response = self._request_catalog_html(
                        "POST", stage="course_details", data=form_data
                    )

                    # A fresh copy, so nothing carries over from an earlier attempt.
                    detailed_course = self._get_course_details_with_term_selection(
                        response.text, replace(course, unavailable=[])
                    )

                    # Debug: save detailed response (using smart saving)
                    self._save_debug_html(
                        response.text, f"course_details_{course.subject}_{course.course_code}.html"
                    )

                    return detailed_course

                # Giving up fails the subject, which blocks publishing and names it. Looping
                # here instead would strand every subject after this one.
                except ValueError as e:
                    # Validation error (corrupted HTML, missing buttons, etc.)
                    attempt += 1
                    if attempt >= self.config.max_course_attempts:
                        self._keep_failed_course_page(response, course)
                        raise
                    # Same backoff as _robust_request
                    wait_time = min(60, 1.0 * (2 ** (attempt - 1)))
                    self.logger.warning(
                        f"Course details validation failed (attempt {attempt}), retrying in {wait_time}s: {e}"
                    )
                    time.sleep(wait_time)
                    # Continue loop - re-fetch course details page

                except Exception as e:
                    # Unexpected error - also retry (could be parsing error from bad HTML)
                    attempt += 1
                    if attempt >= self.config.max_course_attempts:
                        self._keep_failed_course_page(response, course)
                        raise
                    wait_time = min(60, 1.0 * (2 ** (attempt - 1)))
                    self.logger.error(
                        f"Unexpected error getting course details (attempt {attempt}), retrying in {wait_time}s: {e}"
                    )
                    time.sleep(wait_time)

    def _retry_system_error[T](self, course: Course, fetch: Callable[[], T]) -> T | None:
        """Run one part of a course, retrying a CUSIS system error on its own.

        Once attempts run out, record where on the course and return None, so the
        caller saves that part empty.
        """
        for attempt in range(1, self.config.max_course_attempts + 1):
            try:
                return fetch()
            except CatalogSystemError as e:
                if attempt == self.config.max_course_attempts:
                    self.logger.error(f"{e}; saving it empty")
                    course.unavailable.append(e.where)
                    return None
                wait_time = min(60, 1.0 * (2 ** (attempt - 1)))
                self.logger.warning(f"{e} (attempt {attempt}), retrying in {wait_time}s")
                time.sleep(wait_time)

    def _get_course_details_with_term_selection(self, html: str, base_course: Course) -> Course:
        """Get course details for all available terms"""
        soup = BeautifulSoup(html, "html.parser")
        self._check_course_page(soup, html, base_course, stage="course_details")
        self._extract_course_details(soup, base_course)

        # Extract Course Outcome details if requested
        if self.config.get_course_outcome:
            self._scrape_course_outcome(html, base_course)

        # Check for term dropdown
        term_select = soup.find("select", {"id": "uc_course_ddl_class_term"})
        if not term_select:
            self.logger.info("No term dropdown found, using current data")
            # Create a single term with available data
            current_term = self._parse_current_term_info(html)
            if current_term:
                base_course.terms = [current_term]
            return base_course

        # Get all available terms from dropdown
        available_terms = []
        for option in term_select.find_all("option"):
            term_code = option.get("value", "").strip()
            term_name = option.get_text().strip()
            if term_code and term_name:
                available_terms.append((term_code, term_name))

        self.logger.info(
            f"Found {len(available_terms)} terms: {[name for _, name in available_terms]}"
        )

        # Any other failure propagates to get_course_details, which re-scrapes the course:
        # a dropped term is indistinguishable from one CUHK stopped offering.
        all_term_info = []
        for i, (term_code, term_name) in enumerate(available_terms):
            self.logger.info(f"Scraping term {i + 1}/{len(available_terms)}: {term_name}")
            term_info = self._retry_system_error(
                base_course,
                lambda: self._scrape_term_details(html, base_course, term_code, term_name),
            )
            # Still a term CUSIS lists, so keep it, with no sections; the course's
            # `unavailable` record says why they are missing.
            if term_info is None:
                term_info = TermInfo(term_code=term_code, term_name=term_name, schedule=[])
            all_term_info.append(term_info)

        base_course.terms = all_term_info

        self.logger.info(
            f"Extracted details: Credits={base_course.credits}, Terms={len(all_term_info)}"
        )
        return base_course

    def _scrape_term_details(
        self, html: str, base_course: Course, term_code: str, term_name: str
    ) -> TermInfo | None:
        """Scrape details for a specific term"""
        soup = BeautifulSoup(html, "html.parser")

        # The caller reached here by finding this dropdown in the same HTML.
        term_select = soup.find("select", {"id": "uc_course_ddl_class_term"})
        current_selected = (
            term_select.find("option", {"selected": "selected"}) if term_select else None
        )
        is_current_term = current_selected and current_selected.get("value") == term_code

        # If not current term, switch to it
        if not is_current_term:
            self.logger.info(f"Switching to {term_name}")

            # Prepare postback for term change
            form_data = self._extract_asp_hidden_fields(soup)
            form_data["uc_course$ddl_class_term"] = term_code
            form_data["__EVENTTARGET"] = "uc_course$ddl_class_term"
            form_data["__EVENTARGUMENT"] = ""

            # Submit term change
            response = self._request_catalog_html(
                "POST", stage="term_switch", target=term_name, data=form_data
            )
            html = response.text
            soup = BeautifulSoup(html, "html.parser")
            self._check_course_page(
                soup,
                html,
                base_course,
                stage="term_switch",
                term_code=term_code,
                term_name=term_name,
            )

        # Check "Show sections" button - click only if enabled
        show_sections_btn = soup.find("input", {"id": "uc_course_btn_class_section"})
        if show_sections_btn:
            # Check if button is disabled
            is_disabled = show_sections_btn.get("disabled") is not None

            if not is_disabled:
                self.logger.info(f"Clicking 'Show sections' for {term_name}")

                # Prepare postback for showing sections
                form_data = self._extract_asp_hidden_fields(soup)
                form_data["uc_course$btn_class_section"] = "Show sections"
                form_data["uc_course$ddl_class_term"] = term_code

                # Submit show sections
                response = self._request_catalog_html(
                    "POST", stage="show_sections", target=term_name, data=form_data
                )
                html = response.text
                self._check_course_page(
                    BeautifulSoup(html, "html.parser"),
                    html,
                    base_course,
                    stage="show_sections",
                    term_code=term_code,
                    term_name=term_name,
                )
            else:
                self.logger.info(f"'Show sections' disabled for {term_name}: already shown")

            # Save debug file for the sections HTML (already visible if the button was disabled)
            filename = f"sections_{base_course.subject}_{base_course.course_code}_{term_name.replace(' ', '_').replace('-', '_')}.html"
            self._save_debug_html(html, filename)

        # Parse the term-specific information
        return self._parse_term_info(html, term_code, term_name)

    def _extract_course_header_info(self, soup: BeautifulSoup) -> tuple[str, str, str] | None:
        """Subject, number and title from a detail page header like "PHED 1370 - Archery"."""
        header = soup.find("span", {"id": "uc_course_lbl_course"})
        if not header:
            return None
        subject_and_code, separator, title = header.get_text().strip().partition(" - ")
        parts = subject_and_code.split()
        if not separator or len(parts) != 2:
            return None
        return parts[0], parts[1], title.strip()

    def _extract_course_details(self, soup: BeautifulSoup, course: Course) -> None:
        """Extract all course details from the detail page"""

        # The header is clean where the list row may bracket the number: "(1370)".
        _, course.course_code, course.title = self._extract_course_header_info(soup)

        # Credits
        units_elem = soup.find("span", {"id": "uc_course_lbl_units"})
        course.credits = clean_html_text(units_elem.get_text()) if units_elem else ""

        # Course description
        desc_elem = soup.find("span", {"id": "uc_course_lbl_crse_descrlong"})
        if desc_elem:
            # Use HTML content (not extracted text) to preserve <br> tags and formatting
            # TODO(#27): store the original HTML too, so conversion can improve without re-scraping
            desc_html = str(desc_elem)
            course.description, _ = html_to_clean_markdown(desc_html)

        # Enrollment requirement
        enroll_elem = soup.find("td", {"id": "uc_course_tc_enrl_requirement"})
        if enroll_elem:
            course.enrollment_requirement = clean_html_text(enroll_elem.get_text())

        # Course attributes (course-level attributes like "Virtual Teaching & Learning Course")
        course_attr_elem = soup.find("td", {"id": "uc_course_tc_crse_attributes"})
        if course_attr_elem:
            course.course_attributes = clean_html_text(course_attr_elem.get_text())

        # Academic career (Undergraduate/Graduate)
        career_elem = soup.find("span", {"id": "uc_course_lbl_acad_career"})
        if career_elem:
            course.academic_career = clean_html_text(career_elem.get_text())

        # Grading basis
        grading_elem = soup.find("span", {"id": "uc_course_lbl_grading_basis"})
        if grading_elem:
            course.grading_basis = clean_html_text(grading_elem.get_text())

        # Component (Lecture, Tutorial, etc.)
        component_elem = soup.find("span", {"id": "uc_course_lbl_component"})
        if component_elem:
            course.component = clean_html_text(component_elem.get_text())

        # Campus
        campus_elem = soup.find("span", {"id": "uc_course_lbl_campus"})
        if campus_elem:
            course.campus = clean_html_text(campus_elem.get_text())

        # Academic group
        group_elem = soup.find("span", {"id": "uc_course_lbl_acad_group"})
        if group_elem:
            course.academic_group = clean_html_text(group_elem.get_text())

        # Academic organization
        org_elem = soup.find("span", {"id": "uc_course_lbl_acad_org"})
        if org_elem:
            course.academic_org = clean_html_text(org_elem.get_text())

    def _parse_schedule_from_html(self, html: str) -> tuple[list[dict], set[str]]:
        """Extract schedule data and instructors from HTML - shared parsing logic"""
        soup = BeautifulSoup(html, "html.parser")

        # Group meetings by section to reflect merged cell structure
        sections_data = {}
        instructors = set()

        # Find schedule tables (handle both specific ID and general search)
        schedule_tables = []

        # First try to find by specific ID pattern
        schedule_table = soup.find("table", {"id": lambda x: x and "gv_sched" in x})
        if schedule_table:
            schedule_tables.append(schedule_table)
        else:
            # Fallback: search all tables for schedule tables
            for table in soup.find_all("table"):
                if "gv_sched" in str(table.get("id", "")):
                    schedule_tables.append(table)

        # Parse each schedule table
        for table in schedule_tables:
            # Get both normal and alternating row styles
            rows = table.find_all(
                "tr", class_=["normalGridViewRowStyle", "normalGridViewAlternatingRowStyle"]
            )
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 3:
                    # Extract section info
                    section = clean_html_text(cells[0].get_text())

                    # Skip if section doesn't look like a valid section identifier
                    # Valid sections should contain parentheses (e.g., "--LEC (8192)", "-L01-LAB (5726)")
                    if not section or "(" not in section or ")" not in section:
                        continue

                    # Extract status info from status icon (second cell)
                    status = "Unknown"
                    if len(cells) >= 2:
                        status_img = cells[1].find("img")
                        if status_img:
                            img_src = status_img.get("src", "")
                            status = parse_enrollment_status_from_image(img_src)

                    # Initialize section if not seen before
                    if section not in sections_data:
                        sections_data[section] = {
                            "section": section,
                            "status": status,
                            "meetings": [],
                            # This path never opens the class page. Empty, not absent:
                            # publishing reads both off every section.
                            # TODO(#329): and it states "status" where the other parser
                            # states "availability", which is what the app reads.
                            "class_attributes": "",
                            "enrollment_requirement": "",
                        }

                    # Extract meeting info from nested table
                    meet_table = cells[2].find("table")
                    if meet_table:
                        # Note: These nested tables don't have headers, all rows are data
                        meet_rows = meet_table.find_all(
                            "tr",
                            class_=["normalGridViewRowStyle", "normalGridViewAlternatingRowStyle"],
                        )
                        # Debug logging (uncomment if needed for troubleshooting)
                        # self.logger.info(f"Found {len(meet_rows)} meet rows for section {section}")
                        for i, meet_row in enumerate(meet_rows):
                            # self.logger.info(f"Meet row {i}: class={meet_row.get('class')}")
                            meet_cells = meet_row.find_all("td")
                            if len(meet_cells) >= 4:
                                days_times = clean_html_text(meet_cells[0].get_text())
                                room = clean_html_text(meet_cells[1].get_text())
                                instructor = clean_html_text(meet_cells[2].get_text())
                                dates = clean_html_text(meet_cells[3].get_text())

                                if instructor and instructor != "TBA":
                                    instructors.add(instructor)

                                if days_times and dates:
                                    # Each row becomes one meeting under this section
                                    sections_data[section]["meetings"].append(
                                        {
                                            "time": days_times,
                                            "location": room,
                                            "instructor": instructor,
                                            "dates": dates,
                                        }
                                    )

        # Convert to list format for JSON serialization
        schedule_data = list(sections_data.values())
        return schedule_data, instructors

    def _create_term_info(
        self,
        html: str,
        term_code: str = "",
        term_name: str = "Unknown Term",
        get_enrollment_details: bool = False,
    ) -> TermInfo | None:
        """Create TermInfo from HTML with optional term metadata"""
        if get_enrollment_details:
            # Use detailed section parsing with enrollment data
            schedule_data, instructors = self._parse_schedule_with_enrollment_details(html)
        else:
            # Use current fast parsing method
            schedule_data, instructors = self._parse_schedule_from_html(html)

        # Always create TermInfo if we have term codes/names (even with empty schedule)
        if term_code or term_name != "Unknown Term" or schedule_data:
            return TermInfo(term_code=term_code, term_name=term_name, schedule=schedule_data or [])

        return None

    def _parse_schedule_with_enrollment_details(self, html: str) -> tuple[list[dict], set[str]]:
        """Parse schedule with detailed enrollment data by clicking into each section"""
        soup = BeautifulSoup(html, "html.parser")
        sections_data = {}
        instructors = set()

        # Find schedule tables to extract section links
        schedule_tables = []
        schedule_table = soup.find("table", {"id": lambda x: x and "gv_sched" in x})
        if schedule_table:
            schedule_tables.append(schedule_table)
        else:
            # Fallback: search all tables for schedule tables
            for table in soup.find_all("table"):
                if "gv_sched" in str(table.get("id", "")):
                    schedule_tables.append(table)

        for table in schedule_tables:
            # Get section rows
            # TODO(#418): a renamed row class reads as no rows.
            rows = table.find_all(
                "tr", class_=["normalGridViewRowStyle", "normalGridViewAlternatingRowStyle"]
            )
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 2:
                    # Look for section link in first cell
                    section_link = cells[0].find("a")
                    if section_link:
                        section_name = clean_html_text(section_link.get_text())
                        postback_target = section_link.get("href", "")

                        # Skip if section doesn't look valid
                        if not section_name or "(" not in section_name or ")" not in section_name:
                            continue

                        self.logger.info(f"Getting enrollment details for section: {section_name}")

                        # Click into section to get detailed enrollment data
                        section_details = self._get_section_enrollment_details(
                            postback_target, html, section_name
                        )
                        if section_details:
                            sections_data[section_name] = section_details
                            # Add instructors from this section
                            if "meetings" in section_details:
                                for meeting in section_details["meetings"]:
                                    instructor = meeting.get("instructor", "")
                                    if instructor and instructor != "TBA":
                                        instructors.add(instructor)

        # Convert to list format for JSON serialization
        schedule_data = list(sections_data.values())
        return schedule_data, instructors

    def _get_section_enrollment_details(
        self, postback_target: str, current_html: str, section_name: str
    ) -> dict | None:
        """Click into a section to get detailed enrollment information"""
        # Extract postback parameters from the JavaScript call
        if "javascript:__doPostBack(" not in postback_target:
            return None

        # Parse the postback parameters
        # Format: javascript:__doPostBack('uc_course$gv_sched$ctl02$lkbtn_class_section','')
        start = postback_target.find("'") + 1
        end = postback_target.find("'", start)
        event_target = postback_target[start:end] if start > 0 and end > start else ""

        if not event_target:
            self.logger.warning(f"Could not parse postback target: {postback_target}")
            return None

        soup = BeautifulSoup(current_html, "html.parser")

        # Prepare postback for section enrollment details
        form_data = self._extract_asp_hidden_fields(soup)
        form_data["__EVENTTARGET"] = event_target
        form_data["__EVENTARGUMENT"] = ""

        # Submit the postback to get class details
        response = self._request_catalog_html(
            "POST", stage="class_details", target=section_name, data=form_data
        )
        class_details_html = response.text

        # Save debug file for class details HTML (using smart saving)
        if self.current_course_code:
            self._save_debug_html(
                class_details_html, self._class_details_debug_filename(section_name)
            )

        # Parse the class details page
        return self._parse_class_details(class_details_html, section_name)

    # Trailing "(8704)" in a schedule-grid section name, which is CUHK's class number.
    CLASS_NUMBER_IN_SECTION_NAME = re.compile(r"\((\d+)\)\s*$")

    def _class_details_debug_filename(self, section_name: str, suffix: str = "") -> str:
        """Debug filename for one section's class details response."""
        clean_section = (
            section_name.replace("(", "").replace(")", "").replace(" ", "_").replace("-", "")
        )
        return (
            f"class_details_{self.current_subject or 'UNKNOWN'}"
            f"_{self.current_course_code or 'UNKNOWN'}_{clean_section}{suffix}.html"
        )

    def _validate_class_details_response(self, soup: BeautifulSoup, section_name: str) -> None:
        """Raise unless this is the class details page for this section.

        Every other postback checks it got the page it asked for; this one did not, so an
        error page parsed into a blank record that looked like a real section with nothing
        available. Raising propagates to get_course_details(), which retries the course.
        """
        status_elem = soup.find("span", {"id": CLASS_STATUS_FIELD})
        if not status_elem or not clean_html_text(status_elem.get_text()):
            raise ValueError(
                f"No class status for section {section_name} - response is not a class details page"
            )

        # Every section postback replays the same schedule-page viewstate, so a response
        # about a different class is otherwise indistinguishable from the right one.
        expected = self.CLASS_NUMBER_IN_SECTION_NAME.search(section_name)
        number_elem = soup.find("span", {"id": "uc_class_lbl_class_nbr"})
        served = clean_html_text(number_elem.get_text()) if number_elem else ""
        if expected and served != expected.group(1):
            raise ValueError(
                f"Class details for class {served!r} returned for section {section_name}"
            )

        # The seat counts sit in a different panel from the status, so the checks above do
        # not cover them. Left to publish, a restructured panel would first write every
        # section as offering nothing; here it retries, and fails before writing anything.
        unreadable = sorted(
            name
            for name, element_id in self.SEAT_COUNT_FIELDS.items()
            if not self._seat_count_text(soup, element_id).isdigit()
        )
        if unreadable:
            raise ValueError(
                f"Unreadable seat counts for section {section_name}: {', '.join(unreadable)}"
            )

    @staticmethod
    def _seat_count_text(soup: BeautifulSoup, element_id: str) -> str:
        element = soup.find("span", {"id": element_id})
        return clean_html_text(element.get_text()) if element else ""

    def _parse_class_details(self, html: str, section_name: str) -> dict | None:
        """Parse class details page to extract section info with enrollment data"""
        soup = BeautifulSoup(html, "html.parser")

        try:
            self._validate_class_details_response(soup, section_name)
        except ValueError:
            # _keep_failed_course_page saves the course details response, not this one,
            # so the page that actually failed would otherwise be lost.
            self._save_debug_html(
                html, self._class_details_debug_filename(section_name, "_FAILED"), force_save=True
            )
            raise

        # Extract class availability information
        availability = self._parse_class_availability(soup)

        # Extract meeting information
        meetings = []
        meeting_table = soup.find("table", {"id": "uc_class_gv_meet"})
        if meeting_table:
            # TODO(#418): a renamed row class reads as no rows.
            rows = meeting_table.find_all(
                "tr", class_=["normalGridViewRowStyle", "normalGridViewAlternatingRowStyle"]
            )
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 4:
                    meeting = {
                        "time": clean_html_text(cells[0].get_text()),
                        "location": clean_html_text(cells[1].get_text()),
                        "instructor": clean_html_text(cells[2].get_text()),
                        "dates": clean_html_text(cells[3].get_text()),
                    }
                    meetings.append(meeting)

        # Teaching language, mode, SDG-GE tags. Publishing drops what the course repeats.
        class_attributes = ""
        class_attr_elem = soup.find("td", {"id": "uc_class_tc_class_attributes"})
        if class_attr_elem:
            class_attributes = clean_html_text(class_attr_elem.get_text())

        # The class's own requirement, followed by its course's: CHLT 1001's cell is a
        # faculty line plus the course's "--".
        enrollment_requirement = ""
        enrl_elem = soup.find("td", {"id": "uc_class_tc_enrl_requirement"})
        if enrl_elem:
            enrollment_requirement = clean_html_text(enrl_elem.get_text())

        # Use the original section name from the schedule page
        # TODO(#329): the shape every published section has, defined nowhere.
        return {
            "section": section_name,
            "meetings": meetings,
            "availability": availability,
            "class_attributes": class_attributes,
            "enrollment_requirement": enrollment_requirement,
        }

    # The seat counts of the "Class Availability" panel, by the id CUHK gives each span.
    SEAT_COUNT_FIELDS = {
        "capacity": "uc_class_lbl_enrl_cap",
        "enrolled": "uc_class_lbl_enrl_tot",
        "waitlist_capacity": "uc_class_lbl_wait_cap",
        "waitlist_total": "uc_class_lbl_wait_tot",
        "available_seats": "uc_class_lbl_available_seat",
    }

    def _parse_class_availability(self, soup: BeautifulSoup) -> dict:
        """Parse the Class Details status and the Class Availability seat counts.

        Every value is whatever CUHK printed, verbatim — an empty string when the page
        does not carry it. Nothing here is computed: a status we derived would be
        indistinguishable from one CUHK stated, and could never be checked afterwards.
        """
        availability = dict.fromkeys(self.SEAT_COUNT_FIELDS, "")
        availability["status"] = ""

        for name, element_id in self.SEAT_COUNT_FIELDS.items():
            availability[name] = self._seat_count_text(soup, element_id)

        status_elem = soup.find("span", {"id": CLASS_STATUS_FIELD})
        if status_elem:
            availability["status"] = clean_html_text(status_elem.get_text())

        self._warn_on_status_icon_mismatch(soup, availability["status"])

        return availability

    def _warn_on_status_icon_mismatch(self, soup: BeautifulSoup, status: str) -> None:
        """Log when the status icon and the status word disagree.

        Both render the same field, so they should never differ. Nothing else enumerates
        CUHK's status words now that we store them verbatim, which makes this the only
        place a change in their wording would be noticed.
        """
        status_img = soup.find("img", {"id": "uc_class_img_status"})
        if not status_img or not status:
            return

        from_icon = parse_enrollment_status_from_image(status_img.get("src", ""))
        if from_icon != "Unknown" and from_icon != status:
            self.logger.warning(
                f"Class status icon says {from_icon!r} but the page says {status!r} — "
                f"CUHK's wording may have changed"
            )

    def _parse_current_term_info(self, html: str) -> TermInfo | None:
        """Parse term info when no dropdown is available"""
        return self._create_term_info(html)

    def _parse_term_info(self, html: str, term_code: str, term_name: str) -> TermInfo | None:
        """Parse term-specific information from HTML"""
        return self._create_term_info(
            html, term_code, term_name, self.config.get_enrollment_details
        )

    def _html_to_markdown(self, html_content: str) -> str:
        """Convert HTML content to clean Markdown format with Word HTML preprocessing"""
        if not html_content:
            return ""

        try:
            # Use the modular HTML utilities for conversion
            result, is_markdown = html_to_clean_markdown(html_content)

            if not is_markdown:
                self.logger.warning("markdownify not available, using plain text extraction")

            return result

        except Exception as e:
            self.logger.warning(
                f"Error in HTML processing: {e}, falling back to basic text extraction"
            )
            return clean_html_text(html_content)

    def _scrape_course_outcome(self, current_html: str, course: Course) -> None:
        """Navigate to Course Outcome page and extract detailed course information"""
        soup = BeautifulSoup(current_html, "html.parser")

        # Validate parent HTML has Course Outcome button (all courses should have this)
        outcome_btn = soup.find("input", {"id": "btn_course_outcome"})
        if not outcome_btn:
            # Missing button = corrupted course details page (likely network issue during fetch)
            # Raise ValueError to trigger retry in get_course_details()
            raise ValueError(
                f"Missing Course Outcome button for {course.course_code} - "
                f"corrupted course details page (likely network issue)"
            )

        # Prepare postback for Course Outcome page
        form_data = self._extract_asp_hidden_fields(soup)
        form_data["btn_course_outcome"] = "Course Outcome"

        # Submit Course Outcome request
        self.logger.info("Navigating to Course Outcome page")
        response = self._retry_system_error(
            course,
            lambda: self._request_catalog_html("POST", stage="course_outcome", data=form_data),
        )
        if response is None:
            return

        # Debug: save Course Outcome response (using smart saving)
        self._save_debug_html(
            response.text, f"course_outcome_{course.subject}_{course.course_code}.html"
        )

        # Validate response structure before parsing
        if not self._validate_course_outcome_response(response.text, course):
            # The retry loop saves the details page, which looks healthy — this is the one
            # that failed. Left behind even when a retry succeeds: a file records that CUHK
            # hiccuped, where tracking would report a failure the retry cleared (#80).
            self._save_debug_html(
                response.text,
                f"course_outcome_{course.subject}_{course.course_code}_INVALID.html",
                force_save=True,
            )
            # Raise ValueError to trigger retry in get_course_details()
            raise ValueError(f"Invalid course outcome page structure for {course.course_code}")

        # Parse Course Outcome page only if validation passes
        self._parse_course_outcome_content(response.text, course)

    def _validate_course_outcome_response(self, html: str, course: Course) -> bool:
        """
        Validate course outcome response to prevent data loss from server errors

        This method performs multi-layer validation to detect invalid responses that would
        cause course outcome data to be overwritten with empty values.

        Returns:
            True: Valid response, safe to parse and update course outcome data
            False: Invalid response, preserve existing course outcome data
        """
        try:
            # Check 1: Minimum structural requirements - ensure it's actually a course outcome page
            # Example valid: <div class="titleNormal">Course Outcome</div>
            # Example invalid: <div class="titleNormal">Course Catalog</div> (wrong page)
            soup = BeautifulSoup(html, "html.parser")
            if not soup.find("div", class_="titleNormal", string="Course Outcome"):
                self.logger.error("Missing 'Course Outcome' title")
                return False

            # Check 2: Content structure validation - ensure page has outcome sections
            # Checks for section headers like "Learning Outcome", "Course Syllabus", "Assessment Type", etc.
            # These headers have class="reverseHeaderStyle" and indicate the page has actual content
            # Example: <td class="reverseHeaderStyle">Learning Outcome</td>
            section_headers = soup.find_all("td", class_="reverseHeaderStyle")
            if len(section_headers) < 1:
                self.logger.error("Outcome page has no content sections")
                return False

            self.logger.debug("Course outcome response validation passed")
            return True

        except Exception as e:
            self.logger.error(f"Error validating course outcome response: {e}")
            return False  # Fail safe - preserve existing data if validation fails

    def _parse_course_outcome_content(self, html: str, course: Course) -> None:
        """Parse Course Outcome page content and extract all relevant information"""
        # TODO(#27): store the original HTML too, so conversion can improve without re-scraping
        soup = BeautifulSoup(html, "html.parser")

        # Extract Assessment Types (table structure)
        assessment_table = soup.find("table", {"id": "uc_course_outcome_gv_ast"})
        if assessment_table and hasattr(assessment_table, "find_all"):
            # Type guard: ensure it's a Tag before passing to _parse_assessment_table
            course.assessment_types = self._parse_assessment_table(assessment_table)

        # Extract Learning Outcomes (convert to Markdown for rich formatting)
        learning_outcome_span = soup.find("span", {"id": "uc_course_outcome_lbl_learning_outcome"})
        if learning_outcome_span:
            course.learning_outcomes = self._html_to_markdown(str(learning_outcome_span))

        # Extract Course Syllabus (convert to Markdown for tables and lists)
        syllabus_span = soup.find("span", {"id": "uc_course_outcome_lbl_course_syllabus"})
        if syllabus_span:
            course.course_syllabus = self._html_to_markdown(str(syllabus_span))

        # Extract Feedback for Evaluation (convert to Markdown)
        feedback_span = soup.find("span", {"id": "uc_course_outcome_lbl_feedback"})
        if feedback_span:
            course.feedback_evaluation = self._html_to_markdown(str(feedback_span))

        # Extract Required Readings (convert to Markdown for lists)
        required_reading_span = soup.find("span", {"id": "uc_course_outcome_lbl_req_reading"})
        if required_reading_span:
            course.required_readings = self._html_to_markdown(str(required_reading_span))

        # Extract Recommended Readings (convert to Markdown for lists)
        recommended_reading_span = soup.find("span", {"id": "uc_course_outcome_lbl_rec_reading"})
        if recommended_reading_span:
            course.recommended_readings = self._html_to_markdown(str(recommended_reading_span))

        self.logger.info("Course Outcome parsed")

    def _parse_assessment_table(self, table: Tag | None) -> dict[str, str]:
        """Parse assessment types table and return as key-value pairs"""
        if not table:
            return {}

        assessment_types: dict[str, str] = {}

        try:
            # Find all data rows (skip header row)
            rows = table.find_all("tr")
            for row in rows[1:]:  # Skip header row
                cells = row.find_all("td")
                if len(cells) >= 3:
                    # Extract assessment type and percentage
                    assessment_type = clean_html_text(cells[1].get_text())
                    percentage = clean_html_text(cells[2].get_text())

                    if assessment_type and percentage:
                        assessment_types[assessment_type] = percentage

        except Exception as e:
            self.logger.warning(f"Error parsing assessment table: {e}")

        return assessment_types

    def scrape_all_subjects(self, subjects: list[str], mode: str = "partial") -> dict[str, Any]:
        """Memory-safe scraping with immediate saves, progress tracking, and memory cleanup.

        mode is "full" for every subject CUHK offers, "partial" for a chosen few, or
        "resume" to finish an interrupted scrape — which ignores `subjects` and reads
        what is left from the record.
        """
        if mode == "resume":
            # Which already announced the run, with the same count and where it left off.
            subjects = self._subjects_left_to_scrape()
        else:
            self.logger.info(f"🚀 Starting scraping for {len(subjects)} subjects")
        self.logger.info(f"Saving to: {self.config.output_directory}/")

        # Ensure output directory exists
        os.makedirs(self.config.output_directory, exist_ok=True)

        # Fills the title cache each subject's metadata reads from.
        self.get_subjects_with_titles_from_live_site()

        # Initialize progress tracker if enabled
        if self.config.track_progress:
            self.progress_tracker = ScrapingProgressTracker(
                self.config.progress_file, self.logger, subjects, self.config, mode
            )
            self.logger.info(f"Progress tracking enabled: {self.config.progress_file}")
        elif mode != "partial":
            # A stamp needs the scrape's start time and directories, both kept there.
            raise ValueError(f"A {mode} scrape needs track_progress enabled")

        completed_subjects = []
        failed_subjects = []
        saved_files = {}

        for i, subject in enumerate(subjects):
            self.logger.info(f"🗂️  Processing {subject} ({i + 1}/{len(subjects)})")

            # Track start time for duration calculation
            start_time = time.time()

            try:
                courses = self.scrape_subject(subject)

                # Always try to save, even if no courses (some subjects legitimately have no courses)
                saved_file = self._save_subject_immediately(subject, courses or [], self.config)

                # None means the save failed; an empty list means an empty subject
                # scraped fine (still completed).
                if saved_file is not None:
                    completed_subjects.append(subject)
                    saved_files[subject] = saved_file
                    saved_display = render_output_files(saved_file)

                    duration_minutes = (time.time() - start_time) / 60
                    unavailable = [gap for course in courses or [] for gap in course.unavailable]
                    if unavailable:
                        self.logger.warning(
                            f"{subject} saved with these empty after a CUSIS system error: "
                            + ", ".join(unavailable)
                        )
                    if self.progress_tracker:
                        self.progress_tracker.complete_subject(
                            subject, len(courses or []), saved_file, unavailable=unavailable
                        )

                    # Use different message for empty vs populated subjects
                    if courses:
                        self.logger.info(
                            f"💾 {subject} completed: {len(courses)} courses in {duration_minutes:.1f}min → {saved_display}"
                        )
                    else:
                        self.logger.info(
                            f"💾 {subject} completed: no courses (empty subject) in {duration_minutes:.1f}min → {saved_display}"
                        )
                else:
                    failed_subjects.append(subject)
                    self.logger.error(f"{subject} save failed")
                    if self.progress_tracker:
                        self.progress_tracker.fail_subject(subject, "Save failed")

                # CRITICAL: Clean memory before next subject (prevent crashes)
                self.logger.debug(f"Cleaning memory after {subject}")
                del courses  # Explicit cleanup
                gc.collect()  # Force garbage collection

            except CaptchaNotAccepted:
                # The next subject would get the same captcha, so stop as if interrupted:
                # this subject stays unattempted and --resume starts from it.
                raise
            except Exception as e:
                failed_subjects.append(subject)
                self.logger.error(f"{subject} failed with exception: {e}")

                # Mark subject as failed in progress tracker
                if self.progress_tracker:
                    self.progress_tracker.fail_subject(subject, str(e))

                # Clean up even on failure
                gc.collect()

        # Reaching the end of the loop proves the catalog was covered, failures included.
        self._write_scrape_times(mode)

        tally = ""
        # Last: a run that dies writing the files above is a killed run, and stays
        # in_progress rather than being recorded as one that finished.
        if self.progress_tracker:
            self.progress_tracker.finish_run()
            tally = f": {self.progress_tracker.run_summary()}"
        # Yellow when the run lost subjects; the level column says so, not the message.
        finished = f"🏁 Scrape finished{tally}"
        self.logger.log(logging.WARNING if failed_subjects else logging.INFO, finished)

        return {
            "completed": completed_subjects,
            "failed": failed_subjects,
            "saved_files": saved_files,
        }

    def _subjects_left_to_scrape(self) -> list[str]:
        """What the recorded full scrape never attempted. Refuses rather than guessing."""
        scrape = load_latest_full_scrape(self.config.progress_file)
        if scrape is None:
            raise NothingToResume(
                f"No full scrape recorded in {self.config.progress_file}. "
                "Run without arguments to start one."
            )
        if not scrape["remaining"]:
            raise NothingToResume(
                f"The full scrape started {scrape['started_at']} finished. "
                "Run without arguments to start a new one."
            )
        # Warn rather than refuse: a 12-hour scrape has already drifted from the catalog
        # it began with, so age is a matter of degree, not a line to draw. And the stamp
        # is the scrape's start, so finishing a stale one understates freshness.
        age = datetime.now(UTC) - datetime.fromisoformat(scrape["started_at"])
        if age > RESUME_AGE_LIMIT:
            self.logger.warning(
                f"This scrape is {format_duration_human(int(age.total_seconds()))} old, "
                "more than a nightly cycle. Any subject CUHK has added since is missing "
                "from it — a fresh full scrape may serve you better."
            )
        self.logger.info(
            f"▶️  Resuming the scrape started {scrape['started_at']}: "
            f"{len(scrape['remaining'])} subjects left"
        )
        return list(scrape["remaining"])

    def _write_scrape_times(self, mode: str) -> None:
        """Stamp every directory the scrape wrote with when the scrape started.

        Both come from `latest_full_scrape`, not this run, so a run finishing an
        interrupted scrape stamps all of them rather than only what it touched.

        Skipped for a partial scrape: it refreshes a few subjects, so advancing a
        directory's stamp would speak for the subjects it never touched.

        A full run that had failures still stamps, which overstates their age. Publishing
        is what stops that reaching the app: it blocks on any `failed` subject. An
        `incomplete` one was scraped this run, so the stamp is true for it.
        """
        if mode == "partial":
            self.logger.info("Partial scrape: leaving scrape times untouched")
            return

        scrape = self.progress_tracker.latest_full_scrape
        scraped_at = scrape["started_at"]
        if not scrape["directories"]:
            # Only reachable when no subject completed, here or in the runs before it.
            self.logger.warning("No directories to stamp: this scrape has written nothing")
            return

        for directory in scrape["directories"]:
            (Path(directory) / SCRAPE_TIME_FILENAME).write_text(f"{scraped_at}\n", encoding="utf-8")
        self.logger.info(f"Stamped {len(scrape['directories'])} directories with {scraped_at}")

    def _save_subject_immediately(
        self, subject: str, courses: list[Course], config: ScrapingConfig
    ) -> list[str] | None:
        """Save single subject immediately to prevent data loss.

        Writes one file per academic year plus the no-terms bucket
        (data/<year>/<subject>.json). Returns the list of written paths (empty for
        an empty subject), or None on failure.
        """
        try:
            # No fallback to the code: the app already renders one at display time, where
            # it can't be mistaken for scraped data.
            subject_title = self.subject_titles_cache.get(subject, "")

            # Remove subject code prefix from title for cleaner display (e.g., "UGEC - Society and Culture" → "Society and Culture")
            if " - " in subject_title:
                subject_title = subject_title.split(" - ", 1)[1]

            # No scrape timestamp here: it would rewrite every file on every run.
            # Freshness is stamped once per directory instead (see _write_scrape_times).
            metadata = {
                "schema_version": SCHEMA_VERSION,
                "subject": subject,
                "subject_title": subject_title,  # Add subject title to metadata
                "total_courses": len(courses),
            }

            subject_data = {
                "metadata": metadata,
                "courses": [course.to_dict() for course in courses],
            }

            # Write one file per academic year (+ the no-terms bucket), partitioning
            # the subject's courses/terms by year. An empty subject produces no file.
            written = []
            produced_subdirs = set()
            for year, slice_data in partition_subject_by_year(subject_data).items():
                subdir = year if year is not None else NO_TERMS_DIR
                produced_subdirs.add(subdir)
                dir_path = os.path.join(config.output_directory, subdir)
                os.makedirs(dir_path, exist_ok=True)
                file_path = os.path.join(dir_path, f"{subject}.json")
                save_json_with_newline(file_path, slice_data)
                # Recorded in logs/scraping_progress.json, which is committed, so keep
                # separators posix rather than whatever the scraping machine uses.
                written.append(Path(file_path).as_posix())

            # If this scrape found no dormant courses, drop any stale no-terms file so a
            # now-offered course isn't left duplicated in both a year dir and no-terms.
            if NO_TERMS_DIR not in produced_subdirs:
                stale_no_terms = os.path.join(
                    config.output_directory, NO_TERMS_DIR, f"{subject}.json"
                )
                if os.path.exists(stale_no_terms):
                    os.remove(stale_no_terms)

            # Year dirs get no equivalent pruning: a subject that drops out of a still-active
            # year keeps its file from the previous scrape, and the app still serves it.
            # TODO(#149): reconcile year subdirs the same way.

            return written

        except Exception as e:
            self.logger.error(f"SAVE FAILED for {subject}: {e}")
            return None


def main():
    """Smoke-test the scraper against one subject with the testing defaults.

    Production runs go through scripts/scrape_all_subjects.py, not this.
    """
    console = logging.StreamHandler()
    console.setFormatter(scrape_log_formatter())
    logging.basicConfig(level=logging.INFO, handlers=[console])

    scraper = CuhkScraper()
    show_scrape_context(scraper, [console])

    # Get subjects from live website
    print("Getting subjects from live website...")
    subjects = scraper.get_subjects_from_live_site()
    print(f"Found {len(subjects)} subjects: {subjects[:10]}...")  # Show first 10

    # Test with just CSCI first
    test_subjects = ["CSCI"] if "CSCI" in subjects else [subjects[0]]
    print(f"Testing with subjects: {test_subjects}")

    try:
        print("\n=== TESTING MODE (default) ===")
        print(f"- Limited to {scraper.config.max_courses_per_subject} courses per subject")
        print(f"- Debug files enabled: {scraper.config.save_debug_files}")
        print(f"- {scraper.config.request_delay}s delays between requests")

        # Testing mode (default behavior)
        # Configure scraper for detailed testing
        scraper.config.get_details = True
        scraper.config.get_enrollment_details = True
        scraper.config.get_course_outcome = True
        results = scraper.scrape_all_subjects(test_subjects)

        # Show summary
        completed_count = len(results["completed"])
        failed_count = len(results["failed"])
        total_files = len(results["saved_files"])
        print(f"Scraping completed: {completed_count} subjects successful, {failed_count} failed")
        print(f"Files saved: {total_files}")
        if results["saved_files"]:
            print(f"Saved files: {list(results['saved_files'].values())}")

    except KeyboardInterrupt:
        print("\nScraping interrupted")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
