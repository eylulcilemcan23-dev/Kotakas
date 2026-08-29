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
