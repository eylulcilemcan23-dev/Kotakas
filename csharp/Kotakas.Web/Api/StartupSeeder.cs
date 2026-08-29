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
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { "admin_owner", "admin_full", "admin_limited", "trader", "user" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole(role));

        await SeedSetting(db, "normal_commission_percent", app.Configuration["Kotakas:NormalCommissionPercent"] ?? "4");
        await SeedSetting(db, "trader_commission_percent", app.Configuration["Kotakas:TraderCommissionPercent"] ?? "3");
        await SeedSetting(db, "paid_listing_try", "0");

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

    private static async Task SeedSetting(AppDbContext db, string key, string value)
    {
        if (await db.SiteSettings.AnyAsync(x => x.Key == key)) return;
        db.SiteSettings.Add(new SiteSetting { Key = key, Value = value });
        await db.SaveChangesAsync();
    }
}
