package nz.zladybeatz.caseflow

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "clients")
data class Client(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val pronouns: String = "",
    val culturalName: String = "",
    val notes: String = ""
)

@Entity(tableName = "case_notes")
data class CaseNote(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val clientId: Long,
    val dateTime: Long,
    val presentingNeed: String = "",
    val korero: String = "",
    val strengths: String = "",
    val actions: String = "",
    val culturalConsiderations: String = "",
    val followUp: String = "",
    val audioPath: String = ""
)

@Entity(tableName = "reminders")
data class Reminder(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val timeMillis: Long,
    val clientId: Long = 0,
    val repeatDaily: Boolean = true
)
