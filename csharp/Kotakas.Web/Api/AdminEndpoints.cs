using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));
        admin.MapGet("/overview", async (AppDbContext db) => Results.Ok(new { overview = new { users = await db.Users.CountAsync(), traders = await db.Users.CountAsync(x => x.VerifiedTrader), requests = await db.SaleRequests.CountAsync(), pendingApplications = await db.TraderApplications.CountAsync(x => x.Status == "pending"), deals = await db.Deals.CountAsync() } }));
        admin.MapGet("/users", async (UserManager<ApplicationUser> users, AppDbContext db) => { var rows = await db.Users.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(500).ToListAsync(); var result = new List<object>(); foreach (var u in rows) result.Add(await ApiHelpers.UserDto(users, u)); return Results.Ok(new { users = result }); });
        admin.MapGet("/trader-applications", async (AppDbContext db) => Results.Ok(new { applications = await db.TraderApplications.AsNoTracking().OrderByDescending(x => x.Id).Take(200).ToListAsync() }));
        admin.MapPatch("/users/{id}/active", async (string id, ActiveInput input, ClaimsPrincipal p, UserManager<ApplicationUser> users) =>
        {
            var target = await users.FindByIdAsync(id); if (target is null) return Results.NotFound(); var roles = await users.GetRolesAsync(target);
            if (roles.Contains("admin_owner")) return Results.Forbid(); if (p.IsInRole("admin_limited") && roles.Any(r => r.StartsWith("admin_"))) return Results.Forbid();
            target.AccountStatus = input.Active ? "active" : "suspended"; await users.UpdateAsync(target); return Results.Ok(new { ok = true });
        });
        admin.MapPost("/trader-applications/{id:long}/decision", async (long id, DecisionInput input, ClaimsPrincipal p, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            if (input.Decision is not ("approved" or "rejected")) return Results.BadRequest(); var row = await db.TraderApplications.FirstOrDefaultAsync(x => x.Id == id && x.Status == "pending"); if (row is null) return Results.NotFound();
            row.Status = input.Decision; row.DecidedAt = DateTimeOffset.UtcNow; row.DecidedByUserId = ApiHelpers.UserId(p); var user = await users.FindByIdAsync(row.UserId);
            if (user is not null && input.Decision == "approved") { if (!await users.IsInRoleAsync(user, "trader")) await users.AddToRoleAsync(user, "trader"); user.VerifiedTrader = true; await users.UpdateAsync(user); }
            db.Notifications.Add(new AppNotification { UserId = row.UserId, Title = "Pazarcı başvurusu", Body = input.Decision == "approved" ? "Başvurun onaylandı." : "Başvurun reddedildi." }); await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
        });
        admin.MapGet("/support", async (AppDbContext db) => Results.Ok(new { tickets = await db.SupportTickets.AsNoTracking().OrderByDescending(x => x.Id).Take(300).ToListAsync() }));
        admin.MapPatch("/support/{id:long}", async (long id, SupportStatusInput input, AppDbContext db) => { if (input.Status is not ("open" or "in_progress" or "closed")) return Results.BadRequest(); var row = await db.SupportTickets.FindAsync(id); if (row is null) return Results.NotFound(); row.Status = input.Status; row.UpdatedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(); return Results.Ok(new { ok = true }); });

        var full = app.MapGroup("/api/admin").RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));
        full.MapPatch("/users/{id}/role", async (string id, RoleInput input, ClaimsPrincipal p, UserManager<ApplicationUser> users) =>
        {
            var allowed = new[] { "user", "trader", "admin_limited", "admin_full", "admin_owner" }; if (!allowed.Contains(input.Role)) return Results.BadRequest(); if (input.Role == "admin_owner" && !p.IsInRole("admin_owner")) return Results.Forbid();
            var target = await users.FindByIdAsync(id); if (target is null) return Results.NotFound(); var current = await users.GetRolesAsync(target); if (current.Contains("admin_owner") && input.Role != "admin_owner") return Results.Forbid();
            await users.RemoveFromRolesAsync(target, current); await users.AddToRoleAsync(target, input.Role); target.VerifiedTrader = input.Role == "trader" || target.VerifiedTrader; await users.UpdateAsync(target); return Results.Ok(new { ok = true });
        });
        full.MapGet("/wallets", async (AppDbContext db) =>
        {
            var users = await db.Users.AsNoTracking().OrderBy(x => x.DisplayName).ToListAsync(); var wallets = await db.Wallets.AsNoTracking().ToDictionaryAsync(x => x.UserId);
            return Results.Ok(new { wallets = users.Select(u => new { userId = u.Id, u.DisplayName, u.Email, balanceTry = wallets.TryGetValue(u.Id, out var w) ? w.BalanceTry : 0m }) });
        });
        full.MapPost("/wallets/{id}/adjust", async (string id, WalletAdjustInput input, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (input.AmountTry == 0 || Math.Abs(input.AmountTry) > 1_000_000m || !await db.Users.AnyAsync(x => x.Id == id)) return Results.BadRequest();
            var wallet = await db.Wallets.FirstOrDefaultAsync(x => x.UserId == id); if (wallet is null) { wallet = new Wallet { UserId = id }; db.Wallets.Add(wallet); }
            var before = wallet.BalanceTry; var after = before + input.AmountTry; if (after < 0) return Results.BadRequest(new { error = "insufficient_balance" });
            wallet.BalanceTry = after; wallet.UpdatedAt = DateTimeOffset.UtcNow; db.WalletLedgers.Add(new WalletLedger { UserId = id, AmountTry = input.AmountTry, BeforeTry = before, AfterTry = after, Reason = (input.Reason ?? "Admin bakiye işlemi").Trim(), AdminUserId = ApiHelpers.UserId(p) });
            await db.SaveChangesAsync(); return Results.Ok(new { ok = true, balanceTry = after });
        });
        full.MapGet("/settings", async (AppDbContext db) => Results.Ok(new { settings = await db.SiteSettings.AsNoTracking().ToDictionaryAsync(x => x.Key, x => x.Value) }));
        full.MapPut("/settings", async (SettingsInput input, AppDbContext db) =>
        {
            var values = new Dictionary<string, decimal> { ["normal_commission_percent"] = input.NormalCommissionPercent, ["trader_commission_percent"] = input.TraderCommissionPercent, ["paid_listing_try"] = input.PaidListingTry };
            if (values.Values.Any(x => x < 0 || x > 100)) return Results.BadRequest();
            foreach (var (key, value) in values) { var row = await db.SiteSettings.FindAsync(key); if (row is null) { row = new SiteSetting { Key = key }; db.SiteSettings.Add(row); } row.Value = value.ToString(System.Globalization.CultureInfo.InvariantCulture); row.UpdatedAt = DateTimeOffset.UtcNow; }
            await db.SaveChangesAsync(); return Results.Ok(new { ok = true });
        });
        return app;
    }
}
public record DecisionInput(string Decision);
public record RoleInput(string Role);
public record ActiveInput(bool Active);
public record WalletAdjustInput(decimal AmountTry, string? Reason);
public record SettingsInput(decimal NormalCommissionPercent, decimal TraderCommissionPercent, decimal PaidListingTry);
public record SupportStatusInput(string Status);
