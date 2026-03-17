---
layout: default
title: Отчёты
---

## Последние ежедневные отчёты

{% assign sorted_reports = site.reports | sort: "date" | reverse %}

{% if sorted_reports.size == 0 %}
Пока нет отчётов. Создайте первый файл в `_reports/YYYY-MM-DD.md`.
{% else %}
| Дата | Итоги дня | Время (всего) |
|---|---|---:|
{% for r in sorted_reports limit: 30 %}
| [{{ r.date | date: "%d.%m.%Y" }}]({{ r.url | relative_url }}) | {{ r.day_summary | default: "—" }} | {{ r.time_total | default: "—" }} |
{% endfor %}
{% endif %}

## Недельные итоги

{% assign sorted_weeks = site.weeks | sort: "week_start" | reverse %}

{% if sorted_weeks.size == 0 %}
Пока нет недельных итогов. Создайте файл в `_weeks/YYYY-Www.md` (например, `2026-W11`).
{% else %}
| Неделя | Итоги | Фокус следующей недели |
|---|---|---|
{% for w in sorted_weeks limit: 20 %}
| [{{ w.title }}]({{ w.url | relative_url }}) | {{ w.week_summary | default: "—" }} | {{ w.next_week_focus | default: "—" }} |
{% endfor %}
{% endif %}

