package nz.zladybeatz.caseflow

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Dao
interface CaseDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveClient(client: Client): Long

    @Query("SELECT * FROM clients ORDER BY name LIMIT 20")
    suspend fun clients(): List<Client>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveNote(note: CaseNote): Long

    @Query("SELECT * FROM case_notes WHERE clientId = :clientId ORDER BY dateTime DESC")
    suspend fun notes(clientId: Long): List<CaseNote>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveReminder(reminder: Reminder): Long

    @Query("SELECT * FROM reminders ORDER BY timeMillis")
    suspend fun reminders(): List<Reminder>

    @Query("DELETE FROM reminders WHERE id = :id")
    suspend fun deleteReminder(id: Long)
}

@Database(entities = [Client::class, CaseNote::class, Reminder::class], version = 1)
abstract class CaseDatabase : RoomDatabase() {
    abstract fun dao(): CaseDao

    companion object {
        fun create(context: Context): CaseDatabase = Room.databaseBuilder(
            context.applicationContext,
            CaseDatabase::class.java,
            "case-flow.sqlite"
        ).build()
    }
}
