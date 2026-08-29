using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class StartupSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();
        await EnsureColumn(db, "Deals", "TraderListingId", "INTEGER NULL");
        await EnsureColumn(db, "Deals", "Flow", "TEXT NOT NULL DEFAULT 'request_offer'");
        await EnsureColumn(db, "Deals", "Quantity", "INTEGER NOT NULL DEFAULT 1");
        await EnsureColumn(db, "Deals", "UnitPriceGb", "TEXT NOT NULL DEFAULT '0'");
        await EnsurePaymentIntentTable(db);
        await EnsureTraderReviewTable(db);
        await EnsureFavoriteTable(db);
        await EnsureItemWatchTable(db);
        await EnsureFavoriteNotificationTriggers(db);
        await EnsureItemWatchNotificationTriggers(db);
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { "admin_owner", "admin_full", "admin_limited", "trader", "user" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole(role));

        await SeedSetting(db, "normal_commission_percent", app.Configuration["Kotakas:NormalCommissionPercent"] ?? "4");
        await SeedSetting(db, "trader_commission_percent", app.Configuration["Kotakas:TraderCommissionPercent"] ?? "3");
        await SeedSetting(db, "paid_listing_try", "0");
        await SeedSetting(db, "gb_try_rate", app.Configuration["Kotakas:GbTryRate"] ?? "0");

        var email = app.Configuration["KOTAKAS_ADMIN_EMAIL"];
        var password = app.Configuration["KOTAKAS_ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var admin = await users.FindByEmailAsync(email);
        if (admin is not null) return;
        admin = new ApplicationUser { UserName = email, Email = email, DisplayName = "KOTAKAS Ana Yönetici", EmailConfirmed = true };
        var created = await users.CreateAsync(admin, password);
        if (created.Succeeded) await users.AddToRoleAsync(admin, "admin_owner");
    }

    private static async Task EnsurePaymentIntentTable(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS PaymentIntents (
                Id INTEGER NOT NULL CONSTRAINT PK_PaymentIntents PRIMARY KEY AUTOINCREMENT,
                UserId TEXT NOT NULL,
                Purpose TEXT NOT NULL,
                AmountTry TEXT NOT NULL,
                Provider TEXT NOT NULL,
                ConversationId TEXT NOT NULL,
                ProviderToken TEXT NULL,
                ProviderPaymentId TEXT NULL,
                Status TEXT NOT NULL,
                ErrorMessage TEXT NULL,
                CreatedAt TEXT NOT NULL,
                PaidAt TEXT NULL,
                ConsumedAt TEXT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_PaymentIntents_ConversationId ON PaymentIntents (ConversationId);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_PaymentIntents_UserId_Purpose_Status_CreatedAt ON PaymentIntents (UserId, Purpose, Status, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_PaymentIntents_ProviderToken ON PaymentIntents (ProviderToken);");
    }

    private static async Task EnsureTraderReviewTable(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS TraderReviews (
                Id INTEGER NOT NULL CONSTRAINT PK_TraderReviews PRIMARY KEY AUTOINCREMENT,
                DealId INTEGER NOT NULL,
                TraderUserId TEXT NOT NULL,
                ReviewerUserId TEXT NOT NULL,
                Stars INTEGER NOT NULL,
                Comment TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_TraderReviews_DealId ON TraderReviews (DealId);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_TraderReviews_TraderUserId_CreatedAt ON TraderReviews (TraderUserId, CreatedAt);");
    }

    private static async Task EnsureFavoriteTable(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS Favorites (
                Id INTEGER NOT NULL CONSTRAINT PK_Favorites PRIMARY KEY AUTOINCREMENT,
                UserId TEXT NOT NULL,
                TargetType TEXT NOT NULL,
                TargetId TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_Favorites_UserId_TargetType_TargetId ON Favorites (UserId, TargetType, TargetId);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Favorites_TargetType_TargetId_CreatedAt ON Favorites (TargetType, TargetId, CreatedAt);");
    }

    private static async Task EnsureItemWatchTable(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS ItemWatches (
                Id INTEGER NOT NULL CONSTRAINT PK_ItemWatches PRIMARY KEY AUTOINCREMENT,
                UserId TEXT NOT NULL,
                ServerCode TEXT NOT NULL,
                Query TEXT NOT NULL,
                MaxPriceGb TEXT NULL,
                CreatedAt TEXT NOT NULL
            );
            """);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_ItemWatches_UserId_ServerCode_Query ON ItemWatches (UserId, ServerCode, Query);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ItemWatches_ServerCode_Query_CreatedAt ON ItemWatches (ServerCode, Query, CreatedAt);");
    }

    private static async Task EnsureFavoriteNotificationTriggers(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS TR_Favorites_ListingPriceDrop;");
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS TR_Favorites_TraderNewListing;");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER TR_Favorites_ListingPriceDrop
            AFTER UPDATE OF PriceGb ON Listings
            WHEN CAST(NEW.PriceGb AS REAL) < CAST(OLD.PriceGb AS REAL)
            BEGIN
                INSERT INTO Notifications (UserId, Title, Body, IsRead, CreatedAt)
                SELECT f.UserId,
                       'Favorindeki ilanın fiyatı düştü',
                       NEW.ItemName || ' artık ' || NEW.PriceGb || ' GB. Eski fiyat: ' || OLD.PriceGb || ' GB.',
                       0,
                       strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
                FROM Favorites f
                WHERE f.TargetType = 'listing'
                  AND f.TargetId = CAST(NEW.Id AS TEXT)
                  AND f.UserId <> NEW.SellerUserId;
            END;
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER TR_Favorites_TraderNewListing
            AFTER INSERT ON Listings
            WHEN NEW.Status = 'active'
            BEGIN
                INSERT INTO Notifications (UserId, Title, Body, IsRead, CreatedAt)
                SELECT f.UserId,
                       'Favori pazarcın yeni ilan açtı',
                       NEW.SellerName || ' • ' || NEW.ItemName || ' • ' || NEW.PriceGb || ' GB',
                       0,
                       strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
                FROM Favorites f
                WHERE f.TargetType = 'trader'
                  AND f.TargetId = NEW.SellerUserId
                  AND f.UserId <> NEW.SellerUserId;
            END;
            """);
    }

    private static async Task EnsureItemWatchNotificationTriggers(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS TR_ItemWatches_NewListing;");
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS TR_ItemWatches_PriceThreshold;");

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER TR_ItemWatches_NewListing
            AFTER INSERT ON Listings
            WHEN NEW.Status = 'active'
            BEGIN
                INSERT INTO Notifications (UserId, Title, Body, IsRead, CreatedAt)
                SELECT w.UserId,
                       'Takip ettiğin item için yeni ilan',
                       NEW.ServerCode || ' • ' || NEW.ItemName || ' • ' || NEW.PriceGb || ' GB • ' || NEW.SellerName,
                       0,
                       strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
                FROM ItemWatches w
                WHERE (w.ServerCode = 'ALL' OR w.ServerCode = NEW.ServerCode)
                  AND lower(NEW.ItemName) LIKE '%' || lower(w.Query) || '%'
                  AND (w.MaxPriceGb IS NULL OR CAST(w.MaxPriceGb AS REAL) <= 0 OR CAST(NEW.PriceGb AS REAL) <= CAST(w.MaxPriceGb AS REAL))
                  AND w.UserId <> NEW.SellerUserId;
            END;
            """);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER TR_ItemWatches_PriceThreshold
            AFTER UPDATE OF PriceGb ON Listings
            WHEN CAST(NEW.PriceGb AS REAL) < CAST(OLD.PriceGb AS REAL)
            BEGIN
                INSERT INTO Notifications (UserId, Title, Body, IsRead, CreatedAt)
                SELECT w.UserId,
                       'Item alarmındaki fiyat geldi',
                       NEW.ServerCode || ' • ' || NEW.ItemName || ' artık ' || NEW.PriceGb || ' GB.',
                       0,
                       strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
                FROM ItemWatches w
                WHERE (w.ServerCode = 'ALL' OR w.ServerCode = NEW.ServerCode)
                  AND lower(NEW.ItemName) LIKE '%' || lower(w.Query) || '%'
                  AND w.MaxPriceGb IS NOT NULL
                  AND CAST(w.MaxPriceGb AS REAL) > 0
                  AND CAST(NEW.PriceGb AS REAL) <= CAST(w.MaxPriceGb AS REAL)
                  AND CAST(OLD.PriceGb AS REAL) > CAST(w.MaxPriceGb AS REAL)
                  AND w.UserId <> NEW.SellerUserId;
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
            if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase)) { exists = true; break; }
        await reader.DisposeAsync();
        if (exists) return;
        await using var alter = conn.CreateCommand();
        alter.CommandText = $"ALTER TABLE {table} ADD COLUMN {column} {definition}";
        await alter.ExecuteNonQueryAsync();
    }

    private static async Task SeedSetting(AppDbContext db, string key, string value)
    {
        if (await db.SiteSettings.AnyAsync(x => x.Key == key)) return;
        db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        await db.SaveChangesAsync();
    }
}
