cmake_minimum_required(VERSION 3.8)
project(autoware_teleop LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(rclcpp_lifecycle REQUIRED)
find_package(autoware_control_msgs REQUIRED)
find_package(autoware_vehicle_msgs REQUIRED)
find_package(tier4_vehicle_msgs REQUIRED)

include_directories(include)

add_executable(autoware_teleop
  src/main.cpp
  src/node.cpp
)

ament_target_dependencies(autoware_teleop
  rclcpp
  rclcpp_lifecycle
  autoware_control_msgs
  autoware_vehicle_msgs
  tier4_vehicle_msgs
)

install(TARGETS
  autoware_teleop
  DESTINATION lib/${PROJECT_NAME}
)

install(DIRECTORY
  include/
  DESTINATION include
)

install(DIRECTORY
  launch/
  DESTINATION share/${PROJECT_NAME}/launch
)

install(DIRECTORY
  config/
  DESTINATION share/${PROJECT_NAME}/config
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
