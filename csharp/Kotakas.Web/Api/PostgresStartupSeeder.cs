using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Kotakas.Web.Api;

public static class PostgresStartupSeeder
{
    private const string EfProductVersion = "8.0.8";
    private static readonly string[] LegacyV12RequiredTables =
    [
        "AspNetUsers", "AspNetRoles", "AspNetUserRoles", "SiteSettings", "SaleRequests", "Offers",
        "Deals", "Wallets", "WalletLedgers", "Listings", "PaymentIntents", "UserSessions"
    ];

    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!db.Database.IsNpgsql())
            throw new InvalidOperationException("PostgresStartupSeeder yalnız Npgsql provider ile çalıştırılabilir.");

        if (!await db.Database.CanConnectAsync())
            throw new InvalidOperationException("PostgreSQL bağlantısı kurulamadı.");

        await AdoptLegacyV12BaselineIfNeeded(db);
        await db.Database.MigrateAsync();

        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count != 0)
            throw new InvalidOperationException("PostgreSQL migration tamamlanamadı: " + string.Join(", ", pending));

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { "admin_owner", "admin_full", "admin_limited", "trader", "user" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole(role));

        await SeedSetting(db, "normal_commission_percent", app.Configuration["Kotakas:NormalCommissionPercent"] ?? "4");
        await SeedSetting(db, "trader_commission_percent", app.Configuration["Kotakas:TraderCommissionPercent"] ?? "3");
        await SeedSetting(db, "paid_listing_try", "0");
        await SeedSetting(db, "gb_try_rate", app.Configuration["Kotakas:GbTryRate"] ?? "0");
        await SeedSetting(db, "schema_version", "13");

        var email = app.Configuration["KOTAKAS_ADMIN_EMAIL"];
        var password = app.Configuration["KOTAKAS_ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var admin = await users.FindByEmailAsync(email.Trim());
        if (admin is not null)
        {
            if (!await users.IsInRoleAsync(admin, "admin_owner")) await users.AddToRoleAsync(admin, "admin_owner");
            return;
        }

        admin = new ApplicationUser
        {
            UserName = email.Trim().ToLowerInvariant(),
            Email = email.Trim().ToLowerInvariant(),
            DisplayName = "KOTAKAS Ana Yönetici",
            EmailConfirmed = true,
            UserVerified = true,
            UserVerifiedAt = DateTimeOffset.UtcNow
        };
        var created = await users.CreateAsync(admin, password);
        if (!created.Succeeded)
            throw new InvalidOperationException("PostgreSQL admin hesabı oluşturulamadı: " + string.Join("; ", created.Errors.Select(x => x.Description)));
        await users.AddToRoleAsync(admin, "admin_owner");
    }

    private static async Task AdoptLegacyV12BaselineIfNeeded(AppDbContext db)
    {
        var migrations = db.Database.GetMigrations().ToList();
        var baselineId = migrations.SingleOrDefault(x => x.EndsWith("_V12Baseline", StringComparison.Ordinal));
        if (baselineId is null)
            throw new InvalidOperationException("V12Baseline EF migration bulunamadı; güvenli PostgreSQL açılışı durduruldu.");

        var historyExists = await TableExists(db, "__EFMigrationsHistory");
        var applied = historyExists ? (await db.Database.GetAppliedMigrationsAsync()).ToList() : new List<string>();
        if (applied.Count > 0)
        {
            if (!applied.Contains(baselineId, StringComparer.Ordinal))
                throw new InvalidOperationException("PostgreSQL migration geçmişi var fakat KOTAKAS V12 baseline kaydı yok. Otomatik onarım yapılmadı.");
            return;
        }

        var tableStates = new Dictionary<string, bool>(StringComparer.Ordinal);
        foreach (var table in LegacyV12RequiredTables)
            tableStates[table] = await TableExists(db, table);

        var existingCount = tableStates.Count(x => x.Value);
        if (existingCount == 0) return; // Fresh PostgreSQL database; MigrateAsync creates everything.

        if (existingCount != LegacyV12RequiredTables.Length)
        {
            var missing = tableStates.Where(x => !x.Value).Select(x => x.Key);
            throw new InvalidOperationException("PostgreSQL kısmi/eski şema tespit edildi. Veri güvenliği için açılış durduruldu. Eksik tablolar: " + string.Join(", ", missing));
        }

        // Existing V12 databases were created before EF migrations. Only mark the exact V12 model as applied;
        // do not recreate or modify its existing tables. The next MigrateAsync call applies only V13+ deltas.
        var history = db.GetService<IHistoryRepository>();
        await db.Database.ExecuteSqlRawAsync(history.GetCreateIfNotExistsScript());
        await db.Database.ExecuteSqlRawAsync(history.GetInsertScript(new HistoryRow(baselineId, EfProductVersion)));
    }

    private static async Task<bool> TableExists(AppDbContext db, string tableName)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = @name);";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "@name";
        parameter.Value = tableName;
        command.Parameters.Add(parameter);
        var value = await command.ExecuteScalarAsync();
        return value is bool exists && exists;
    }

    private static async Task SeedSetting(AppDbContext db, string key, string value)
    {
        if (await db.SiteSettings.AnyAsync(x => x.Key == key)) return;
        db.SiteSettings.Add(new SiteSetting { Key = key, Value = value, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
    }
}
