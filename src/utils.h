// utils_time.h
#include <time.h>
#ifdef _WIN32
    #include <windows.h>
#endif

static double get_time_ms() {
#ifdef _WIN32
    static LARGE_INTEGER frequency;
    static int initialized = 0;
    if (!initialized) { QueryPerformanceFrequency(&frequency); initialized = 1; }
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    return (double)now.QuadPart / frequency.QuadPart * 1000.0;
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (ts.tv_sec * 1000.0) + (ts.tv_nsec / 1000000.0);
#endif
}
