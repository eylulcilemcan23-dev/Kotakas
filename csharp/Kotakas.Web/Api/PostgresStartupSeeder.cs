using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class PostgresStartupSeeder
{
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!db.Database.IsNpgsql())
            throw new InvalidOperationException("PostgresStartupSeeder yalnız Npgsql provider ile çalıştırılabilir.");

        await db.Database.EnsureCreatedAsync();
        if (!await db.Database.CanConnectAsync())
            throw new InvalidOperationException("PostgreSQL bağlantısı kurulamadı.");

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { "admin_owner", "admin_full", "admin_limited", "trader", "user" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole(role));

        await SeedSetting(db, "normal_commission_percent", app.Configuration["Kotakas:NormalCommissionPercent"] ?? "4");
        await SeedSetting(db, "trader_commission_percent", app.Configuration["Kotakas:TraderCommissionPercent"] ?? "3");
        await SeedSetting(db, "paid_listing_try", "0");
        await SeedSetting(db, "gb_try_rate", app.Configuration["Kotakas:GbTryRate"] ?? "0");
        await SeedSetting(db, "schema_version", "12");

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

    private static async Task SeedSetting(AppDbContext db, string key, string value)
    {
        if (await db.SiteSettings.AnyAsync(x => x.Key == key)) return;
        db.SiteSettings.Add(new SiteSetting { Key = key, Value = value, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
    }
}
