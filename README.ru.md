# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Calendar MCP

[English](./README.md) | **Русский**

[![npm](https://img.shields.io/npm/v/%40a1-x-tech%2Fmcp-google-calendar)](https://www.npmjs.com/package/@a1-x-tech/mcp-google-calendar)
[![CI](https://github.com/A1-x-Tech/mcp-google-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-calendar/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-calendar/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-calendar)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Calendar MCP** позволяет AI-приложению управлять Google Calendar на естественном языке. Можно просмотреть неделю, назначить встречу с гостями и ссылкой на Google Meet, перенести или отменить её, найти слот, когда все свободны, и заблокировать время под Out of Office или Focus Time.

Сервер работает с Google Calendar API через ваш Google-аккаунт. Он отличает целую повторяющуюся серию от отдельного вхождения и явно показывает ограничения Calendar API, а не создаёт впечатление, что через календарь можно сделать всё.

- **19 инструментов.** Просмотр календарей, событий и занятости, создание и редактирование встреч, работа с повторяющимися сериями, блоки Out of Office и Focus Time — плюс шесть для подключения Google-аккаунта.
- **Вход прямо из диалога.** Файл с учётными данными писать руками не нужно: попросите ассистента подключиться, подтвердите доступ в браузере — и следующий же запрос сработает без перезапуска. Client secret передаётся путём к файлу и никогда не проходит через переписку.
- **Никто не получит письмо случайно.** По умолчанию Calendar API молчит о приглашениях, изменениях и отменах; гости получают письма, только когда вы попросите об этом через `send_updates`.
- **Запись не повторяется вслепую.** После неопределённого сбоя сервер не повторяет запись: продублированное событие может заново разослать письма всем гостям.
- **Минимальные scope Google.** Используются `calendar.events` и `calendar.readonly` без широкого scope `calendar`.

Начните с запроса, который только читает данные:

> Что у меня в календаре на этой неделе? Отметь пересекающиеся встречи.

[Подключить сервер](#быстрый-старт) · [Посмотреть сценарии](#что-можно-поручить) · [Открыть техническую документацию](#техническая-документация)

---

## Увидеть работу за минуту

> **Вы:** Как выглядит мой четверг и когда мы с Анной оба свободны?
>
> **Ассистент:** Показывает события четверга и общие свободные интервалы. Ничего не меняется.
>
> **Вы:** Забронируй 45-минутное дизайн-ревью с Анной в первый общий слот и добавь ссылку на Google Meet.
>
> **Ассистент:** Показывает предлагаемое время, список гостей и ссылку Meet, затем запрашивает подтверждение перед созданием события.
>
> **Вы:** Подтверждаю.
>
> **Ассистент:** Создаёт событие. Никто не получит письмо, пока вы не попросите отправить приглашения.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Что можно поручить](#что-можно-поручить)
- [Как меняется событие](#как-меняется-событие)
- [Что может измениться](#что-может-измениться)
- [Как получить доступ](#как-получить-доступ)
- [Конфигурация](#конфигурация)
- [Данные, лимиты и работа в фоне](#данные-лимиты-и-работа-в-фоне)
- [Техническая документация](#техническая-документация)
- [Поддержка](#поддержка)

## Быстрый старт

Нужны Node.js 20+, Google-аккаунт и OAuth-данные из проекта Google Cloud с включённым Google Calendar API.

1. [Подготовьте Google OAuth-доступ](#как-получить-доступ).
2. Добавьте сервер в AI-приложение.
3. Отправьте запрос, который только читает данные.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**В приложении:** откройте **Settings → Plugins → MCP servers**, нажмите **Add server**, затем добавьте `npx -y @a1-x-tech/mcp-google-calendar@latest` с `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` и `GOOGLE_CALENDAR_REFRESH_TOKEN`.

**В командной строке:**

```bash
codex mcp add google-calendar \
  --env GOOGLE_CALENDAR_CLIENT_ID=your_client_id \
  --env GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_CALENDAR_REFRESH_TOKEN=your_refresh_token \
  -- npx -y @a1-x-tech/mcp-google-calendar@latest
```

```bash
codex mcp list
```

[Документация Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_CALENDAR_CLIENT_ID=your_client_id \
  --env GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_CALENDAR_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-calendar \
  -- npx -y @a1-x-tech/mcp-google-calendar@latest
```

```bash
claude mcp list
```

[Документация Claude Code MCP](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

Откройте **Settings → Developer → Edit Config** и добавьте:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"],
      "env": {
        "GOOGLE_CALENDAR_CLIENT_ID": "your_client_id",
        "GOOGLE_CALENDAR_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CALENDAR_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

Если **Edit Config** недоступна, отредактируйте `~/Library/Application Support/Claude/claude_desktop_config.json` на macOS или `%APPDATA%\Claude\claude_desktop_config.json` на Windows.

[Документация Claude Desktop MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Добавьте в `~/.cursor/mcp.json` на macOS/Linux или `%USERPROFILE%\.cursor\mcp.json` на Windows:

```json
{
  "mcpServers": {
    "google-calendar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"],
      "env": {
        "GOOGLE_CALENDAR_CLIENT_ID": "your_client_id",
        "GOOGLE_CALENDAR_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CALENDAR_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Документация Cursor MCP](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Запустите **MCP: Open User Configuration** и добавьте:

```json
{
  "servers": {
    "google-calendar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-calendar@latest"],
      "env": {
        "GOOGLE_CALENDAR_CLIENT_ID": "${input:calendar_client_id}",
        "GOOGLE_CALENDAR_CLIENT_SECRET": "${input:calendar_client_secret}",
        "GOOGLE_CALENDAR_REFRESH_TOKEN": "${input:calendar_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "calendar_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "calendar_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "calendar_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Проверьте сервер командой **MCP: List Servers**.

[Документация VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## Что можно поручить

### Посмотреть расписание

- Какие встречи у меня на этой неделе? Включи повторяющиеся.
- Покажи завтрашний 1:1 с гостями, ссылкой Meet и напоминаниями.
- Перечисли все вхождения командного синка в марте.

### Планировать и менять встречи

- Создай 45-минутное ревью в четверг с двумя гостями и ссылкой на Google Meet.
- Перенеси ретро на час позже и обнови список гостей — но пока никому не отправляй писем.
- Перемести событие с планированием в командный календарь.
- Отмени пятничное вхождение стендапа, не трогая остальную серию.

### Защитить время

- Когда мы с Анной и Борисом все трое свободны на час на следующей неделе?
- Поставь Out of Office на отпуск и автоматически отклоняй новые приглашения.
- Создай два часа Focus Time завтра утром и включи «не беспокоить» в Google Chat.

## Как меняется событие

1. `calendar_id: "primary"` — ваш основной календарь; другие календари берутся из `list_calendars`, для записи нужен доступ writer.
2. У повторяющейся **серии** и отдельного **вхождения** разные id: id серии меняет или отменяет все вхождения, id вхождения (из `list_event_instances`) — ровно одно.
3. `update_event` меняет только переданные поля, но вложенный объект заменяется целиком — новый список `attendees` замещает весь список гостей.
4. Ни одна запись не отправляет писем, пока `send_updates` не попросит об этом: по умолчанию Calendar API молчит.

Блоки Out of Office и Focus Time существуют только в основном календаре аккаунта Google Workspace; обычный Gmail и дополнительные календари их отклоняют. Создание события не проверяет конфликты — сначала попросите проверить занятость. У событий на весь день дата окончания не включается: событие по пятницу включительно заканчивается субботней датой.

## Что может измениться

| Операция | Что происходит | Граница подтверждения |
|---|---|---|
| Чтение календарей, событий и занятости | Читает расписание; занятость показывает интервалы без названий встреч | Ничего не меняет |
| Создание события | Добавляет событие со временем, на весь день или повторяющееся, при необходимости с гостями и Google Meet | Меняет календарь |
| Создание блока Out of Office или Focus Time | Добавляет специальное событие, которое может автоматически отклонять приглашения или включать «не беспокоить» в Google Chat | Меняет календарь |
| Обновление события | Переносит или редактирует событие; id серии меняет все вхождения | Меняет календарь |
| Перенос события | Перемещает событие в другой календарь | Меняет два календаря |
| Удаление события | Отменяет событие или всю серию; восстановления нет | Разрушительно |
| Технический запрос API | Может вызвать метод API без отдельного инструмента | Потенциально разрушительно |

Как AI-приложение просит подтверждение, определяет само приложение. Сервер помечает операции чтения, записи и удаления, чтобы оно отличило проверку от рабочего изменения.

## Как получить доступ

Доступ к собственным календарям требует OAuth 2.0: одного API-ключа недостаточно. Подключиться можно двумя способами, и первый вообще не требует файла конфигурации.

### Вход из диалога

Запустите сервер без учётных данных и попросите ассистента подключиться. Он проведёт вас по шагам с помощью шести встроенных инструментов:

| Инструмент | Что делает |
|---|---|
| `setup_instructions` | Пошаговый чеклист для стороны Google Cloud, с учётом того, что уже настроено |
| `set_client` | Читает скачанный JSON OAuth-клиента — **по пути к файлу, поэтому секрет не проходит через диалог** |
| `start_login` | Возвращает ссылку авторизации Google и ждёт браузер |
| `finish_login` | Подтверждает вход и сообщает, какой аккаунт подключён |
| `auth_status` | Есть ли вход, откуда он взят и когда истекает — но никогда сам токен |
| `logout` | Отзывает токен на стороне Google и удаляет локальный файл |

Вход вступает в силу сразу: следующий вызов инструмента сработает без перезапуска AI-клиента. Токен хранится в `~/.config/mcp-google-calendar/credentials.json` (в Windows — в `%APPDATA%`), доступен только вашей учётной записи и не покидает вашу машину.

### Либо переменные окружения

Классический путь и единственный подходящий для CI и безбраузерных установок:

1. Создайте или выберите проект Google Cloud и включите **Google Calendar API**.
2. Настройте OAuth consent screen и создайте OAuth-клиент типа **Desktop app**.
3. Авторизуйте Google-аккаунт, календарями которого хотите управлять. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) поможет получить refresh token, если включить **Use your own OAuth credentials**.
4. Запросите оба scope:

   ```text
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/calendar.readonly
   ```

   Широкий scope `https://www.googleapis.com/auth/calendar` нужен только для вызовов `raw_request`, которые управляют самими календарями или правами доступа к ним.

Переменные окружения всегда побеждают вход, сделанный из диалога, поэтому уже настроенная установка продолжит работать ровно как раньше.

Refresh token OAuth-приложения в режиме Testing может истечь через семь дней. Для долгого доступа опубликуйте OAuth-приложение или используйте Internal-приложение в домене Workspace. Храните client secret и refresh token как пароли.

## Конфигурация

| Переменная | Обязательна | Описание |
|---|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | Да* | OAuth client ID. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Да* | OAuth client secret. |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Да* | OAuth refresh token. |
| `GOOGLE_CALENDAR_ACCESS_TOKEN` | Да* | Короткоживущая (~1 час) альтернатива OAuth-тройке. |
| `GOOGLE_CALENDAR_API_BASE` | Нет | Переопределяет базовый URL Google API; по умолчанию `https://www.googleapis.com`. |
| `GOOGLE_CALENDAR_TIMEOUT_MS` | Нет | Тайм-аут одного запроса; по умолчанию `60000` мс. |
| `GOOGLE_CALENDAR_MAX_RETRIES` | Нет | Повторы временных ошибок; по умолчанию `3`. |

\* Передайте OAuth-тройку или access token. Без учётных данных сервер всё равно стартует и отвечает на MCP-рукопожатие; первый вызов инструмента назовёт переменные, которые нужно задать.

## Данные, лимиты и работа в фоне

- **Запросы идут в Google Calendar.** Локальный сервер обновляет OAuth-токены Google и вызывает Calendar API. Анонимная телеметрия содержит ID установки, версию пакета, версии AI-клиента и платформы и имена инструментов — но не OAuth-токены, данные календаря, аргументы или промпты. Чтобы отключить её, задайте `ASKADS_TELEMETRY=0`.
- **У Google есть квоты на проект.** При `429` сервер повторяет запрос с задержкой; чтение также повторяется после сетевых и `5xx` ошибок, а запись после неопределённого сбоя не повторяется — продублированное событие может заново разослать письма всем гостям.
- **Постоянного опроса нет.** Сервер работает только при вызове. `list_events` поддерживает инкрементальные проверки через `updated_min`; если AI-приложение поддерживает задания по расписанию, оно может периодически проверять календарь.

## Техническая документация

- [Каталог MCP-возможностей](./docs/capabilities/index.md) — страницы по пользовательским задачам для каждого инструмента.
- [Все инструменты и параметры](./docs/TOOLS.md)
- [Документация по разработке](./docs/DEVELOPMENT.md)
- [Документация по публикации](./docs/PUBLISHING.md)
- [Справочник Google Calendar API](https://developers.google.com/calendar/api)

## Поддержка

Нашли ошибку или не хватает сценария? [Создайте issue](https://github.com/A1-x-Tech/mcp-google-calendar/issues) или напишите в [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  Вы дочитали до конца!
</p>
