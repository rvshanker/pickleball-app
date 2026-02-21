const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();
const db = getFirestore();

async function fetchWeatherForecast(lat, lng) {
    if (!lat || !lng) return null;
    try {
        const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
            headers: { 'User-Agent': 'PickleConnect/2.0 (pickleconnect.live)' }
        });
        if (!pointRes.ok) throw new Error('points failed');
        const pointData = await pointRes.json();
        const fxRes = await fetch(pointData.properties.forecastHourly, {
            headers: { 'User-Agent': 'PickleConnect/2.0 (pickleconnect.live)' }
        });
        if (!fxRes.ok) throw new Error('forecast failed');
        const fxData = await fxRes.json();
        return fxData.properties.periods.slice(0, 4).map(p => ({
            time: new Date(p.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            temp: p.temperature,
            wind: parseInt(p.windSpeed),
            desc: p.shortForecast,
        }));
    } catch (e) {
        try {
            const r = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1`
            );
            const d = await r.json();
            const now = new Date();
            return d.hourly.time
                .map((t, i) => ({ dt: new Date(t), temp: Math.round(d.hourly.temperature_2m[i]), wind: Math.round(d.hourly.wind_speed_10m[i]) }))
                .filter(h => h.dt >= now)
                .slice(0, 4)
                .map(h => ({
                    time: h.dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    temp: h.temp, wind: h.wind, desc: null,
                }));
        } catch (e2) { return null; }
    }
}

function weatherEmoji(temp, wind) {
    if (wind > 20) return '💨';
    if (temp > 90) return '🥵';
    if (temp > 75) return '☀️';
    if (temp > 60) return '🌤';
    if (temp > 45) return '🌥';
    return '🥶';
}

function buildWeatherLines(forecast) {
    if (!forecast || !forecast.length) return '';
    const lines = forecast.map(h =>
        `  ${h.time}: ${weatherEmoji(h.temp, h.wind)} ${h.temp}°F  💨 ${h.wind}mph${h.desc ? '  ' + h.desc : ''}`
    );
    return '🌤 Next 4 hours:\n' + lines.join('\n');
}

async function buildDynamicMessage(s) {
    const courtDoc = await db.collection('courts').doc(s.courtId).get();
    const court = courtDoc.exists ? courtDoc.data() : {};
    const checkinsSnap = await db.collection('courts').doc(s.courtId).collection('checkins').get();
    const allCheckins = checkinsSnap.docs.map(d => d.data());
    const nowMs = Date.now();
    const playing = allCheckins.filter(c => c.status === 'active');
    const coming = allCheckins.filter(c => c.status === 'later' && c.arrivalTime && c.arrivalTime > nowMs);
    const open = court.openCourts ?? court.numberOfCourts ?? 4;
    const total = court.numberOfCourts ?? 4;
    const crowd = { low: '🟢 Light', medium: '🟡 Busy', high: '🔴 Packed' }[court.crowdLevel] || '';
    const condLabel = court.condition && court.condition !== 'open'
        ? `⚠️ Court: ${court.condition.charAt(0).toUpperCase() + court.condition.slice(1)}` : '';
    const lat = s.courtLat ?? court.lat;
    const lng = s.courtLng ?? court.lng;
    const weatherForecast = s.includeWeather ? await fetchWeatherForecast(lat, lng) : null;
    const weatherLines = buildWeatherLines(weatherForecast);
    return [
        `🎾 ${s.courtName} — Live Update`,
        `📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        ``,
        `👥 Playing now: ${playing.length > 0 ? playing.map(c => c.userName).join(', ') : 'No one yet'}`,
        `⏰ Coming soon: ${coming.length > 0 ? coming.length + ' player' + (coming.length !== 1 ? 's' : '') : 'None scheduled'}`,
        `🏟 Courts: ${open}/${total} open${crowd ? '  ' + crowd : ''}`,
        condLabel, weatherLines,
        court.flashMsg ? `📣 ${court.flashMsg}` : '',
        ``,
        `🔗 https://pickleconnect.live`,
    ].filter(l => l !== undefined && l !== '').join('\n');
}

function nextScheduledTime(s) {
    let nextTime = s.scheduledFor;
    const repeat = s.repeat;
    if (repeat === 'every2h') { nextTime += 2 * 3600000; }
    else if (repeat === 'every4h') { nextTime += 4 * 3600000; }
    else if (repeat === 'daily' || repeat === 'weekdays' || repeat === 'weekends') {
        nextTime += 86400000;
        if (repeat === 'weekdays') {
            const day = new Date(nextTime).getDay();
            if (day === 0) nextTime += 86400000;
            if (day === 6) nextTime += 2 * 86400000;
        } else if (repeat === 'weekends') {
            const day = new Date(nextTime).getDay();
            if (day === 1) nextTime += 5 * 86400000;
            else if (day > 1 && day < 6) nextTime += (6 - day) * 86400000;
        }
    } else if (repeat === 'weekly') { nextTime += 7 * 86400000; }
    else if (repeat === 'daily-times' && s.allTimes && s.allTimes.length > 0) {
        const now = new Date(nextTime);
        const todayStr = now.toISOString().split('T')[0];
        const sortedTimes = [...s.allTimes].sort();
        const currentTimeStr = now.toTimeString().slice(0, 5);
        const nextSlot = sortedTimes.find(t => t > currentTimeStr);
        if (nextSlot) {
            nextTime = new Date(`${todayStr}T${nextSlot}`).getTime();
        } else {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            nextTime = new Date(`${tomorrow.toISOString().split('T')[0]}T${sortedTimes[0]}`).getTime();
        }
    }
    return nextTime;
}

exports.sendScheduledGroupMeMessages = onSchedule('every 5 minutes', async () => {
    const now = Date.now();
    const windowEnd = now + 5 * 60 * 1000;
    try {
        const snap = await db.collectionGroup('scheduled')
            .where('status', '==', 'pending')
            .where('scheduledFor', '<=', windowEnd)
            .orderBy('scheduledFor', 'asc')
            .get();

        for (const doc of snap.docs) {
            const s = doc.data();
            if (!s.courtId) continue;
            if (s.endDate && now > s.endDate) { await doc.ref.update({ status: 'expired' }); continue; }
            const botDoc = await db.collection('groupme_bots').doc(s.courtId).get();
            if (!botDoc.exists) continue;
            const { botId, enabled } = botDoc.data();
            if (!enabled || !botId) continue;

            let msgText;
            try { msgText = s.isDynamic ? await buildDynamicMessage(s) : s.msg; }
            catch (e) { console.error('Message build failed:', e); continue; }
            if (!msgText) continue;

            let postOk = false;
            try {
                const r = await fetch('https://api.groupme.com/v3/bots/post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bot_id: botId, text: msgText }),
                });
                postOk = r.ok || r.status === 202;
            } catch (e) { console.error('GroupMe post failed:', e); }

            await db.collection('groupme_bots').doc(s.courtId).collection('logs').add({
                type: s.isDynamic ? 'scheduled-dynamic' : 'scheduled',
                msg: msgText, sentAt: Date.now(), status: postOk ? 'sent' : 'failed',
            });

            const hasRepeat = s.repeat && s.repeat !== 'none';
            if (hasRepeat) {
                const nextTime = nextScheduledTime(s);
                if (s.endDate && nextTime > s.endDate) { await doc.ref.update({ status: 'expired' }); }
                else { await doc.ref.update({ scheduledFor: nextTime, status: 'pending' }); }
            } else {
                await doc.ref.update({ status: postOk ? 'sent' : 'failed' });
            }
        }
    } catch (e) { console.error('Scheduled sender error:', e); }
});
