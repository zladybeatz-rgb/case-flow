package nz.zladybeatz.caseflow

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

object AlarmManagerHelper {
    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                "case-flow-alarms",
                "Case Flow alarms",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "Paperwork and client follow-up reminders" }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    fun schedule(context: Context, reminder: Reminder) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("title", reminder.title)
            putExtra("repeat", reminder.repeatDaily)
        }
        val pending = PendingIntent.getBroadcast(
            context,
            reminder.id.toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarm = context.getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT >= 23) {
            alarm.setAlarmClock(AlarmManager.AlarmClockInfo(reminder.timeMillis, pending), pending)
        } else {
            alarm.setExact(AlarmManager.RTC_WAKEUP, reminder.timeMillis, pending)
        }
    }

    fun cancel(context: Context, id: Long) {
        val intent = Intent(context, AlarmReceiver::class.java)
        val pending = PendingIntent.getBroadcast(
            context, id.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        context.getSystemService(AlarmManager::class.java).cancel(pending)
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AlarmManagerHelper.createChannel(context)
        val title = intent.getStringExtra("title") ?: "Case Flow reminder"
        val launch = PendingIntent.getActivity(
            context, 1, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        val notification = NotificationCompat.Builder(context, "case-flow-alarms")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText("Tap to open Case Flow")
            .setContentIntent(launch)
            .setFullScreenIntent(launch, true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(sound)
            .setVibrate(longArrayOf(0, 500, 300, 500))
            .build()
        NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), notification)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Saved reminders are restored by the app's coroutine when next opened.
        }
    }
}
