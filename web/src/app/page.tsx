import CourseSearch from '@/components/CourseSearch'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  // Sample calendar events for testing
  const sampleEvents = [
    {
      id: '1',
      courseCode: 'CSCI3100',
      section: '--LEC (8192)',
      title: 'Software Engineering',
      time: 'Mo 14:30 - 15:15',
      location: 'Mong Man Wai Bldg 404',
      instructor: 'Prof. WONG',
      day: 0, // Monday
      startHour: 14,
      endHour: 15,
      startMinute: 30,
      endMinute: 15,
      color: 'bg-blue-500'
    },
    {
      id: '2',
      courseCode: 'CSCI1530',
      section: '--LEC (8193)',
      title: 'Computer Principles',
      time: 'Tu 14:30 - 16:15',
      location: 'Science Centre LG23',
      instructor: 'Dr. CHEONG',
      day: 1, // Tuesday
      startHour: 14,
      endHour: 16,
      startMinute: 30,
      endMinute: 15,
      color: 'bg-green-500'
    },
    {
      id: '3',
      courseCode: 'CSCI1020',
      section: '--LEC (8192)',
      title: 'Hands-on Introduction to C++',
      time: 'Th 13:30 - 14:15',
      location: 'William M W Mong Eng Bldg 404',
      instructor: 'Dr. CHEONG Chi Hong',
      day: 3, // Thursday
      startHour: 13,
      endHour: 14,
      startMinute: 30,
      endMinute: 15,
      color: 'bg-purple-500'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            CUHK Course Planner
          </h1>
          <p className="text-lg text-gray-600">
            Plan your courses with up-to-date schedule information
          </p>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {/* Left Column - Course Search */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Search Courses</CardTitle>
                <CardDescription>
                  Search by course code, title, or instructor name
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CourseSearch />
              </CardContent>
            </Card>

            {/* Available Subjects */}
            <Card>
              <CardHeader>
                <CardTitle>Available Subjects</CardTitle>
                <CardDescription>
                  Currently loaded course data from these subjects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {['CSCI', 'AIST', 'PHYS', 'FINA'].map((subject) => (
                    <div
                      key={subject}
                      className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-center font-medium"
                    >
                      {subject}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Calendar */}
          <div className="h-[600px]">
            <WeeklyCalendar events={sampleEvents} />
          </div>
        </div>
      </div>
    </div>
  )
}
