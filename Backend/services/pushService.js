// Backend/services/pushService.js
// Shared VAPID Web Push Notification Service

const path = require('path');
const fs = require('fs');
const webPush = require('web-push');
const { query } = require('../database.js');

// Load or initialize VAPID Keys
let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY || "BH1CsgBgAM7tZxZGeTEwDD7CUshgolUrDEUB4q6k9KLPAS_NqFvRvgVC_1ts1bLk8r30SgQd_aDa5uyodbOvdtw",
    privateKey: process.env.VAPID_PRIVATE_KEY || "oPT95bXFC4NBb4HEOH6HSN4mtiZ260GmFQ8SD1nUDho"
};

const vapidFile = path.join(__dirname, '..', 'vapid.json');
if (fs.existsSync(vapidFile)) {
    try {
        const fileData = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
        if (fileData.publicKey && fileData.privateKey) {
            vapidKeys = fileData;
        }
    } catch (e) {}
}

try {
    webPush.setVapidDetails(
        'mailto:baidobedrcok@gmail.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
} catch (e) {
    console.warn('[Push Service] VAPID setup warning:', e.message);
}

/**
 * Helper to broadcast VAPID Push Notification to all or target subscribed devices
 * @param {Object} payloadData { title, body, icon, badge, url, image }
 * @param {String} targetRole 'all', 'students', 'teachers', 'parents', 'admin'
 */
async function broadcastPushNotification(payloadData, targetRole = 'all') {
    try {
        let sql = `SELECT * FROM push_subscriptions`;
        let params = [];
        const role = (targetRole || 'all').toLowerCase().trim();

        if (role !== 'all' && role !== 'everyone') {
            const singular = role.endsWith('s') ? role.slice(0, -1) : role;
            const plural = role.endsWith('s') ? role : role + 's';
            sql += ` WHERE LOWER(COALESCE(user_role, 'guest')) IN ($1, $2, 'all', 'guest', 'admin') OR user_role IS NULL`;
            params.push(singular, plural);
        }

        const { rows } = await query(sql, params);
        if (!rows || rows.length === 0) {
            console.log('[Push Service] No registered device tokens found for target role:', role);
            return { sentCount: 0, totalDevices: 0 };
        }

        const payload = JSON.stringify({
            title: payloadData.title || 'Baidoa Bedrock ICT Campus',
            body: payloadData.body || payloadData.message || payloadData.content || 'New announcement posted!',
            icon: payloadData.icon || '/images/icons/icon-192.png',
            badge: payloadData.badge || '/images/icons/icon-192.png',
            url: payloadData.url || '/HTML/index.html',
            image: payloadData.image || null
        });

        let successCount = 0;
        const sendPromises = rows.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth
                }
            };
            try {
                const pushOptions = {
                    TTL: 86400, // 24 hours
                    urgency: 'high', // Forces FCM / APNs to wake lock screen immediately
                    topic: 'campus-updates',
                    headers: {
                        'Urgency': 'high'
                    }
                };
                await webPush.sendNotification(pushSubscription, payload, pushOptions);
                successCount++;
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]).catch(() => {});
                }
            }
        });

        await Promise.allSettled(sendPromises);
        console.log(`[Push Service] Broadcasted "${payloadData.title}" to ${successCount} of ${rows.length} devices.`);
        return { sentCount: successCount, totalDevices: rows.length };
    } catch (err) {
        console.warn('[Push Service] Broadcast error:', err.message);
        return { sentCount: 0, error: err.message };
    }
}

module.exports = {
    vapidKeys,
    broadcastPushNotification
};
