# Daily report site (GitHub Pages)

Это статический сайт на Jekyll для ежедневных и недельных отчётов.

## Как заполнять отчёты

- Ежедневные отчёты: файлы в `_reports/YYYY-MM-DD.md`
- Недельные итоги: файлы в `_weeks/YYYY-Www.md` (например, `2026-W11`)

Редактировать можно прямо на GitHub (кнопка **Edit** у файла), без локальной установки.

## Комментарии руководителя (giscus)

Сайт поддерживает комментарии через GitHub Discussions (giscus). После публикации:

1) В репозитории включите **Discussions**  
2) На странице [giscus](https://giscus.app/) создайте конфигурацию:
   - Repository: ваш репозиторий
   - Discussion category: например, `General`
   - Mapping: `pathname` (чтобы у каждого отчёта был свой тред)
3) Скопируйте `data-repo`, `data-repo-id`, `data-category`, `data-category-id` в `_includes/giscus.html`

## Публикация через GitHub Pages

1) Создайте репозиторий на GitHub (например, `daily-report`)  
2) Загрузите в него содержимое этой папки `daily-report-site`  
3) GitHub → Settings → Pages:
   - Build and deployment → Source: **Deploy from a branch**
   - Branch: `main` / folder: `/ (root)`
4) Откройте выданный GitHub Pages URL

## Локальный запуск (опционально)

Если хочется предпросмотр на компьютере:

- Установите Ruby + Bundler
- Выполните:

```bash
bundle exec jekyll serve
```

