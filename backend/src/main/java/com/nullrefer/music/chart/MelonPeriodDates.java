package com.nullrefer.music.chart;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/** 멜론 주간 차트용 월 내 주차 (월요일 시작 주) */
final class MelonPeriodDates {

  private static final int WEEK_ANCHOR_DOW = 1; // Monday
  private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

  private MelonPeriodDates() {}

  static String[] weekRange(int year, int month, int weekOfMonth) {
    LocalDate anchor = weekAnchor(year, month, weekOfMonth);
    LocalDate end = anchor.plusDays(6);
    return new String[] {anchor.format(YMD), end.format(YMD)};
  }

  static String rankMonth(int year, int month) {
    return String.format("%04d%02d", year, Math.min(12, Math.max(1, month)));
  }

  static int defaultWeekOfMonth(int year, int month, LocalDate today) {
    int max = maxSelectableWeekOfMonth(year, month, today);
    return max > 0 ? max : 1;
  }

  static int maxSelectableWeekOfMonth(int year, int month, LocalDate today) {
    List<Integer> weeks = selectableWeeks(year, month, today);
    return weeks.isEmpty() ? 1 : weeks.get(weeks.size() - 1);
  }

  static List<Integer> selectableWeeks(int year, int month, LocalDate today) {
    int total = weekSlotsInMonth(year, month);
    List<Integer> out = new ArrayList<>();
    YearMonth ym = YearMonth.of(year, month);
    YearMonth cur = YearMonth.from(today);
    if (ym.isBefore(cur)) {
      for (int w = 1; w <= total; w++) {
        out.add(w);
      }
    } else if (ym.equals(cur)) {
      int currentWeek = currentWeekOfMonth(year, month, today);
      for (int w = 1; w <= total; w++) {
        if (currentWeek <= 0 || w < currentWeek) {
          out.add(w);
        }
      }
    }
    if (out.isEmpty()) {
      out.add(1);
    }
    return out;
  }

  private static int currentWeekOfMonth(int year, int month, LocalDate today) {
    int total = weekSlotsInMonth(year, month);
    for (int w = 1; w <= total; w++) {
      LocalDate start = weekAnchor(year, month, w);
      LocalDate end = start.plusDays(6);
      if (!today.isBefore(start) && !today.isAfter(end)) {
        return w;
      }
    }
    return 0;
  }

  private static int weekSlotsInMonth(int year, int month) {
    YearMonth ym = YearMonth.of(year, month);
    int lastDay = ym.lengthOfMonth();
    int firstDow = ym.atDay(1).getDayOfWeek().getValue() % 7; // Sun=0..Sat=6
    return (int) Math.ceil((lastDay + firstDow) / 7.0);
  }

  private static LocalDate weekAnchor(int year, int month, int weekOfMonth) {
    YearMonth ym = YearMonth.of(year, month);
    LocalDate first = ym.atDay(1);
    int firstDow = first.getDayOfWeek().getValue() % 7;
    LocalDate week1Sunday = first.minusDays(firstDow);
    return week1Sunday.plusDays((long) (weekOfMonth - 1) * 7L + WEEK_ANCHOR_DOW);
  }

  static int clampWeek(int year, int month, int week, LocalDate today) {
    List<Integer> allowed = selectableWeeks(year, month, today);
    if (allowed.contains(week)) {
      return week;
    }
    return allowed.get(allowed.size() - 1);
  }

  static int clampMonth(int year, int month, LocalDate today, String kind) {
    if ("weekly".equals(kind)) {
      YearMonth cur = YearMonth.from(today);
      int maxMonth = year == cur.getYear() ? cur.getMonthValue() : 12;
      List<Integer> allowed = new ArrayList<>();
      for (int m = 1; m <= maxMonth; m++) {
        if (!selectableWeeks(year, m, today).isEmpty()) {
          allowed.add(m);
        }
      }
      if (allowed.isEmpty()) {
        return 1;
      }
      if (allowed.contains(month)) {
        return month;
      }
      return allowed.get(allowed.size() - 1);
    }
    YearMonth ym = YearMonth.of(year, month);
    YearMonth cur = YearMonth.from(today);
    if (ym.isAfter(cur)) {
      return Math.max(1, cur.minusMonths(1).getMonthValue());
    }
    if (year == cur.getYear() && month >= cur.getMonthValue()) {
      return Math.max(1, cur.getMonthValue() - 1);
    }
    return Math.min(12, Math.max(1, month));
  }

  static long weeksBetween(LocalDate start, LocalDate end) {
    return ChronoUnit.WEEKS.between(start, end);
  }
}
