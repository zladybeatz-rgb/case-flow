package nz.zladybeatz.caseflow

object CaseNoteParser {
    fun headings(text: String): Map<String, String> {
        val clean = text.trim()
        val headingRegex = Regex("(?i)(presenting need|korero|kōrero|strengths|actions|cultural considerations|follow ?up)\\s*[:\\-]", RegexOption.IGNORE_CASE)
        val matches = headingRegex.findAll(clean).toList()
        if (matches.isEmpty()) return mapOf("korero" to clean)
        val result = mutableMapOf<String, String>()
        matches.forEachIndexed { index, match ->
            val start = match.range.last + 1
            val end = matches.getOrNull(index + 1)?.range?.first ?: clean.length
            val key = when (match.groupValues[1].lowercase()) {
                "presenting need" -> "presentingNeed"
                "korero", "kōrero" -> "korero"
                "strengths" -> "strengths"
                "actions" -> "actions"
                "cultural considerations" -> "culturalConsiderations"
                else -> "followUp"
            }
            result[key] = clean.substring(start, end).trim()
        }
        return result
    }
}
