// index.js (Node.js 18+)

const WHAPI_BASE_URL = "https://gate.whapi.cloud";

import dotenv from 'dotenv';
import { google } from "googleapis";

dotenv.config();

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const CALENDAR_ID = process.env.CALENDAR_ID;
const to = GROUP_CHAT_ID; 

if (!WHAPI_TOKEN) throw new Error('WHAPI_TOKEN is not set');
if (!GROUP_CHAT_ID) throw new Error('GROUP_CHAT_ID is not set');
if (!CALENDAR_ID) throw new Error('CALENDAR_ID is not set');

if (!WHAPI_TOKEN) {
  console.error("Missing WHAPI_TOKEN in env");
  process.exit(1);
}

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Быстрая проверка, что ключ реально есть
if (!creds.client_email) throw new Error("sa.json: missing client_email");
if (!creds.private_key) throw new Error("sa.json: missing private_key");

const auth = new google.auth.JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

await auth.authorize();

const calendar = google.calendar({ version: "v3", auth });

const TZ = "Asia/Bangkok";
const DAYS_AHEAD = 5;

// получить Date-объект для "YYYY-MM-DD" в тайзоне TZ
function tzDateParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = dtf.format(date); // YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function isoWithOffsetBangkok(y, m, d, hh, mm, ss) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}+07:00`;
}

async function sendText(to, body) {
  const res = await fetch(`${WHAPI_BASE_URL}/messages/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHAPI_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      body,
      typing_time: 0,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WHAPI error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  // окно: через DAYS_AHEAD дней, 00:00–06:00 (Bangkok)
  const base = new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const { y, m, d } = tzDateParts(base, TZ);

  const timeMin = isoWithOffsetBangkok(y, m, d, 0, 0, 0);
  const timeMax = isoWithOffsetBangkok(y, m, d, 6, 0, 0);

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  const events = (res.data.items ?? []).filter((ev) => {
  const startDateTime = ev.start?.dateTime;
  if (!startDateTime) return true;

  const hour = new Date(startDateTime).getHours();
  return hour !== 3;
});

  console.log(`Events found: ${events.length}`);

  function cleanSummary(s) {
    let out = (s ?? "").trim();
    if (!out) return "";

    // 1) убрать символы [ и ]
    out = out.replace(/[\[\]]/g, "").trim();

    // 2-3) удалить всё после ПОСЛЕДНЕГО "//" (включая сами //)
    const idx = out.lastIndexOf("//");
    if (idx !== -1) {
      out = out.slice(0, idx).trim();
    }

    return out;
  }

  for (const ev of events) {
    const raw = (ev.summary ?? "").trim();
    const summary = cleanSummary(raw);
    if (!summary) continue;

    const sent = await sendText(to, summary);
    console.log("Sent:", summary, sent);
  }

  console.log('успешно!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});