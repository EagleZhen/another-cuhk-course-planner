import json

import generate_subjects
import pytest


def test_main_rejects_filename_metadata_mismatch(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    year_dir = data_dir / "2025-26"
    year_dir.mkdir(parents=True)
    subject_file = year_dir / "AAAA.json"
    subject_file.write_text(
        json.dumps(
            {
                "metadata": {"subject": "BBBB", "subject_title": "Subject B"},
                "courses": [],
            }
        )
    )
    output_file = tmp_path / "subjects.ts"
    monkeypatch.setattr(generate_subjects, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(generate_subjects, "DATA_DIR", data_dir)
    monkeypatch.setattr(generate_subjects, "SUBJECTS_FILE", output_file)

    with pytest.raises(ValueError, match="AAAA.json.*BBBB.*AAAA"):
        generate_subjects.main()

    assert not output_file.exists()
