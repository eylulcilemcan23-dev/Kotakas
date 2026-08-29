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
    }
}
