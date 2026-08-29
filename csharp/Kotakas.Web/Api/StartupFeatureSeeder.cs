using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class StartupFeatureSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS UserReports (
                Id INTEGER NOT NULL CONSTRAINT PK_UserReports PRIMARY KEY AUTOINCREMENT,
                ReporterUserId TEXT NOT NULL,
                TargetType TEXT NOT NULL,
                TargetId TEXT NOT NULL,
                ReasonCode TEXT NOT NULL,
                Details TEXT NOT NULL,
                Status TEXT NOT NULL,
                AdminNote TEXT NOT NULL,
                ResolvedByUserId TEXT NULL,
                CreatedAt TEXT NOT NULL,
                UpdatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_UserReports_Status_CreatedAt ON UserReports (Status, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_UserReports_Reporter_Target_Status ON UserReports (ReporterUserId, TargetType, TargetId, Status);");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS NotificationPreferences (
                UserId TEXT NOT NULL CONSTRAINT PK_NotificationPreferences PRIMARY KEY,
                OffersEnabled INTEGER NOT NULL DEFAULT 1,
                DealsEnabled INTEGER NOT NULL DEFAULT 1,
                FavoritesEnabled INTEGER NOT NULL DEFAULT 1,
                ItemWatchesEnabled INTEGER NOT NULL DEFAULT 1,
                MarketplaceEnabled INTEGER NOT NULL DEFAULT 1,
                UpdatedAt TEXT NOT NULL
            );
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS AdminAuditEvents (
                Id INTEGER NOT NULL CONSTRAINT PK_AdminAuditEvents PRIMARY KEY AUTOINCREMENT,
                AdminUserId TEXT NOT NULL,
                Method TEXT NOT NULL,
                Path TEXT NOT NULL,
                StatusCode INTEGER NOT NULL,
                CreatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_AdminAuditEvents_AdminUserId_CreatedAt ON AdminAuditEvents (AdminUserId, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_AdminAuditEvents_Method_Path_CreatedAt ON AdminAuditEvents (Method, Path, CreatedAt);");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS SupportReplies (
                Id INTEGER NOT NULL CONSTRAINT PK_SupportReplies PRIMARY KEY AUTOINCREMENT,
                TicketId INTEGER NOT NULL,
                SenderUserId TEXT NOT NULL,
                SenderRole TEXT NOT NULL,
                Message TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_SupportReplies_TicketId_CreatedAt ON SupportReplies (TicketId, CreatedAt);");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS IdempotencyRecords (
                Id INTEGER NOT NULL CONSTRAINT PK_IdempotencyRecords PRIMARY KEY AUTOINCREMENT,
                UserId TEXT NOT NULL,
                Scope TEXT NOT NULL,
                RequestKey TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_IdempotencyRecords_User_Scope_Key ON IdempotencyRecords (UserId, Scope, RequestKey);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_IdempotencyRecords_CreatedAt ON IdempotencyRecords (CreatedAt);");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS UserSessions (
                Id INTEGER NOT NULL CONSTRAINT PK_UserSessions PRIMARY KEY AUTOINCREMENT,
                UserId TEXT NOT NULL,
                DeviceId TEXT NOT NULL,
                DeviceLabel TEXT NOT NULL,
                UserAgentHash TEXT NOT NULL,
                IpHint TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                LastSeenAt TEXT NOT NULL,
                RevokedAt TEXT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_UserSessions_User_Device ON UserSessions (UserId, DeviceId);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_UserSessions_User_LastSeenAt ON UserSessions (UserId, LastSeenAt);");

        // Additive upgrades for existing SQLite databases. No existing data is removed.
        await EnsureColumn(db, "AspNetUsers", "UserVerified", "INTEGER NOT NULL DEFAULT 0");
        await EnsureColumn(db, "AspNetUsers", "UserVerifiedAt", "TEXT NULL");
        await EnsureColumn(db, "AspNetUsers", "UserVerifiedByUserId", "TEXT NULL");
        await EnsureColumn(db, "AspNetUsers", "LastSeenAt", "TEXT NULL");
        await EnsureColumn(db, "AspNetUsers", "TraderAcceptingOffers", "INTEGER NOT NULL DEFAULT 1");

        // New sale-request alerts are suppressed when a trader explicitly turns offer intake off.
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS TR_Notifications_TraderAvailability;");
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER TR_Notifications_TraderAvailability
            AFTER INSERT ON Notifications
            WHEN NEW.Title = 'Yeni satış talebi'
            BEGIN
                DELETE FROM Notifications
                WHERE Id = NEW.Id
                  AND EXISTS (
                    SELECT 1 FROM AspNetUsers u
                    WHERE u.Id = NEW.UserId
                      AND u.VerifiedTrader = 1
                      AND u.TraderAcceptingOffers = 0
                  );
            END;
            """);
    }

    private static async Task EnsureColumn(AppDbContext db, string table, string column, string definition)
    {
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        await using var check = conn.CreateCommand();
        check.CommandText = $"PRAGMA table_info({table})";
        await using var reader = await check.ExecuteReaderAsync();
        var exists = false;
        while (await reader.ReadAsync())
        {
            if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase))
            {
                exists = true;
                break;
            }
        }
        await reader.DisposeAsync();
        if (exists) return;
        await using var alter = conn.CreateCommand();
        alter.CommandText = $"ALTER TABLE {table} ADD COLUMN {column} {definition}";
        await alter.ExecuteNonQueryAsync();
    }
}
