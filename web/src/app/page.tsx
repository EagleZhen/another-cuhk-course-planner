import CourseSearch from '@/components/CourseSearch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
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

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          <Card className="mb-6">
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

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">4</div>
                <div className="text-sm text-gray-600">Subjects Available</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">200+</div>
                <div className="text-sm text-gray-600">Courses</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">2024-25</div>
                <div className="text-sm text-gray-600">Academic Year</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">Live</div>
                <div className="text-sm text-gray-600">Data</div>
              </CardContent>
            </Card>
          </div>

          {/* Available Subjects */}
          <Card>
            <CardHeader>
              <CardTitle>Available Subjects</CardTitle>
              <CardDescription>
                Currently loaded course data from these subjects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      </div>
    </div>
  )
}
