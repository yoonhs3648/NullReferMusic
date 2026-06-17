cmake_minimum_required(VERSION 3.18)
project(nrm_argos_translate LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CT2_SRC_DIR "" CACHE PATH "CTranslate2 source directory")
if(NOT CT2_SRC_DIR OR NOT EXISTS "${CT2_SRC_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "CT2_SRC_DIR must point to a CTranslate2 checkout")
endif()

set(CT2_BUILD_CLI OFF CACHE BOOL "" FORCE)
set(CT2_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS ON CACHE BOOL "" FORCE)
set(WITH_DNNL OFF CACHE BOOL "" FORCE)
set(WITH_MKL OFF CACHE BOOL "" FORCE)
set(ENABLE_GPU OFF CACHE BOOL "" FORCE)
# Android NDK: MKL/DNNL/OpenBLAS 없음 — Ruy SGEMM은 INT8 계열만 (backend.cc).
# nrm_argos_translate.cpp Android 분기: INT8_FLOAT32 / INT8 만 사용. FLOAT32 금지.
set(WITH_RUY ON CACHE BOOL "" FORCE)

add_subdirectory(${CT2_SRC_DIR} ${CMAKE_BINARY_DIR}/ctranslate2-build EXCLUDE_FROM_ALL)

set(SPM_SRC_DIR "" CACHE PATH "sentencepiece source directory")
if(NOT SPM_SRC_DIR OR NOT EXISTS "${SPM_SRC_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "SPM_SRC_DIR must point to a sentencepiece checkout")
endif()

set(SPM_ENABLE_SHARED OFF CACHE BOOL "" FORCE)
set(SPM_ENABLE_TCMALLOC OFF CACHE BOOL "" FORCE)
add_subdirectory(${SPM_SRC_DIR} ${CMAKE_BINARY_DIR}/sentencepiece-build EXCLUDE_FROM_ALL)

add_executable(nrm-argos-translate src/nrm_argos_translate.cpp)
target_link_libraries(
  nrm-argos-translate
  PRIVATE
  ctranslate2
  sentencepiece-static
)
target_include_directories(
  nrm-argos-translate
  PRIVATE
  ${CT2_SRC_DIR}/include
  ${SPM_SRC_DIR}/src
)

if(ANDROID)
  find_library(ANDROID_LOG_LIB log)
  target_link_libraries(nrm-argos-translate PRIVATE ${ANDROID_LOG_LIB})
endif()
