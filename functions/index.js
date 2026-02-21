// ── Scheduled GroupMe Message Sender ────────────────────────────────────
// Add this to your Firebase Cloud Functions index.js
// Runs every 5 minutes to check for pending scheduled messages

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore } = require('firebase-admin/firestore');
const fetch = require('node-fetch'); // or use built-in fetch if Node 18+

exports.sendScheduledGroupMeMessages = onSchedule('every 5 minutes', async () => {
    const db = getFirestore();
    const now = Date.now();
    const windowEnd = now + 5 * 60 * 1000; // next 5 min window

    try {
        // Query all pending scheduled messages due now
        const snap = await db.collectionGroup('scheduled')
            .where('status', '==', 'pending')
            .where('scheduledFor', '<=', windowEnd)
            .orderBy('scheduledFor', 'asc')
            .get();

        for (const doc of snap.docs) {
            const s = doc.data();
            if (!s.courtId) continue;

            // Get bot config
            const botDoc = await db.collection('groupme_bots').doc(s.courtId).get();
            if (!botDoc.exists) continue;
            const { botId, enabled } = botDoc.data();
            if (!enabled || !botId) continue;

            let msgText;

            if (s.isDynamic) {
                // ── DYNAMIC: Fetch live court data RIGHT NOW ──────────────
                const courtDoc = await db.collection('courts').doc(s.courtId).get();
                const court = courtDoc.exists ? courtDoc.data() : {};

                const checkinsSnap = await db.collection('courts').doc(s.courtId)
                    .collection('checkins').get();
                const allCheckins = checkinsSnap.docs.map(d => d.data());
                const nowMs = Date.now();
                const playing = allCheckins.filter(c => c.status === 'active');
                const coming = allCheckins.filter(c =>
                    c.status === 'later' && c.arrivalTime && c.arrivalTime > nowMs
                );

                const open = court.openCourts ?? court.numberOfCourts ?? 4;
                const total = court.numberOfCourts ?? 4;
                const crowd = { low: '🟢 Light', medium: '🟡 Busy', high: '🔴 Packed' }[court.crowdLevel] || '';
                const condLabel = court.condition && court.condition !== 'open'
                    ? `⚠️ Court: ${court.condition.charAt(0).toUpperCase() + court.condition.slice(1)}\n`
                    : '';

                const lines = [
                    `🎾 ${s.courtName} — Live Update`,
                    `📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
                    ``,
                    `👥 Playing now: ${playing.length > 0 ? playing.map(c => c.userName).join(', ') : 'No one yet'}`,
                    `⏰ Coming soon: ${coming.length > 0 ? coming.length + ' player' + (coming.length !== 1 ? 's' : '') : 'None scheduled'}`,
                    `🏟 Courts: ${open}/${total} open${crowd ? '  ' + crowd : ''}`,
                    condLabel,
                    court.flashMsg ? `📣 ${court.flashMsg}` : '',
                    ``,
                    `🔗 https://pickleconnect.live`,
                ].filter(l => l !== undefined && l !== '').join('\n');

                msgText = lines;
            } else {
                // ── STATIC: Use stored message ────────────────────────────
                msgText = s.msg;
            }

            if (!msgText) continue;

            // Post to GroupMe
            let postOk = false;
            try {
                const r = await fetch('https://api.groupme.com/v3/bots/post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bot_id: botId, text: msgText }),
                });
                postOk = r.ok || r.status === 202;
            } catch (e) {
                console.error('GroupMe post failed:', e);
            }

            // Log the result
            await db.collection('groupme_bots').doc(s.courtId).collection('logs').add({
                type: s.isDynamic ? 'scheduled-dynamic' : 'scheduled',
                msg: msgText,
                sentAt: Date.now(),
                status: postOk ? 'sent' : 'failed',
            });

            // Handle repeat or mark done
            if (s.repeat && s.repeat !== 'none') {
                let nextTime = s.scheduledFor;
                if (s.repeat === 'every2h') {
                    nextTime += 2 * 60 * 60 * 1000;
                } else if (s.repeat === 'every4h') {
                    nextTime += 4 * 60 * 60 * 1000;
                } else if (s.repeat === 'daily' || s.repeat === 'weekdays' || s.repeat === 'weekends') {
                    nextTime += 24 * 60 * 60 * 1000;
                    // Skip weekdays/weekends as needed
                    if (s.repeat === 'weekdays') {
                        const day = new Date(nextTime).getDay();
                        if (day === 0) nextTime += 24 * 60 * 60 * 1000; // skip Sunday
                        if (day === 6) nextTime += 2 * 24 * 60 * 60 * 1000; // skip Saturday
                    } else if (s.repeat === 'weekends') {
                        const day = new Date(nextTime).getDay();
                        if (day === 1) nextTime += 5 * 24 * 60 * 60 * 1000; // skip Mon→Sat
                        else if (day > 0 && day < 6) nextTime += (6 - day) * 24 * 60 * 60 * 1000;
                    }
                } else if (s.repeat === 'weekly') {
                    nextTime += 7 * 24 * 60 * 60 * 1000;
                }
                await doc.ref.update({ scheduledFor: nextTime, status: 'pending' });
            } else {
                await doc.ref.update({ status: postOk ? 'sent' : 'failed' });
            }
        }
    } catch (e) {
        console.error('CollectionGroup query failed:', e);
    }
});
