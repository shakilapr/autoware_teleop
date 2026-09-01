cmake_minimum_required(VERSION 3.8)
project(autoware_teleop_msgs LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(autoware_vehicle_msgs REQUIRED)
find_package(builtin_interfaces REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/Intent.msg"
  DEPENDENCIES autoware_vehicle_msgs builtin_interfaces
)

ament_export_dependencies(rosidl_default_runtime)
ament_export_dependencies(autoware_vehicle_msgs)
ament_export_dependencies(builtin_interfaces)

ament_package()
