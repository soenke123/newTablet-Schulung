// 10 real seconds = 20 in-game minutes; total 360s real = 720 in-game minutes (15:00–03:00)
const REAL_TO_INGAME_RATIO = 2; // in-game minutes per real second

const EVENT_SCHEDULE = [
  { ingameMinute: 120, eventType: 'SPORT'      }, // 17:00
  { ingameMinute: 240, eventType: 'ABENDESSEN' }, // 19:00
  { ingameMinute: 360, eventType: 'TREFFEN'    }, // 21:00
  { ingameMinute: 480, eventType: 'SCHLAF'     }, // 23:00
];

function realToIngameMinutes(elapsedSeconds) {
  return elapsedSeconds * REAL_TO_INGAME_RATIO;
}

function ingameMinutesToString(minutes) {
  const totalMinutes = 15 * 60 + Math.floor(minutes);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
