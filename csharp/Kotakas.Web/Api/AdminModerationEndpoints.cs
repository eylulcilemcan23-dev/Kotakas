using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class AdminModerationEndpoints
{
    public static IEndpointRouteBuilder MapAdminModerationEndpoints(this IEndpointRouteBuilder app)
    {
        var moderation = app.MapGroup("/api/admin/moderation")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full", "admin_limited"));

        moderation.MapGet("/listings", async (AppDbContext db) => Results.Ok(new
        {
            listings = await db.Listings.AsNoTracking().OrderByDescending(x => x.Id).Take(500).ToListAsync()
        }));

        moderation.MapGet("/reviews", async (AppDbContext db) =>
        {
            var rows = await db.TraderReviews.AsNoTracking().OrderByDescending(x => x.Id).Take(300).ToListAsync();
            var ids = rows.SelectMany(x => new[] { x.TraderUserId, x.ReviewerUserId }).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName);
            return Results.Ok(new
            {
                reviews = rows.Select(x => new
                {
                    x.Id,
                    x.DealId,
                    x.Stars,
                    x.Comment,
                    x.CreatedAt,
                    trader = names.TryGetValue(x.TraderUserId, out var trader) ? trader : "Pazarcı",
                    reviewer = names.TryGetValue(x.ReviewerUserId, out var reviewer) ? reviewer : "Kullanıcı"
                })
            });
        });

        moderation.MapPost("/sale-requests/{id:long}/cancel", async (long id, ClaimsPrincipal principal, IWebHostEnvironment env, AppDbContext db) =>
        {
            var row = await db.SaleRequests.Include(x => x.Offers).FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.Status != "open") return Results.Conflict(new { error = "request_not_open" });
            row.Status = "cancelled";
            foreach (var offer in row.Offers.Where(x => x.Status == "active"))
            {
                offer.Status = "declined";
                db.Notifications.Add(new AppNotification { UserId = offer.TraderUserId, Title = "Talep moderasyonla kapatıldı", Body = $"{row.ItemName} satış talebi yönetim tarafından kapatıldı." });
            }
            db.Notifications.Add(new AppNotification { UserId = row.UserId, Title = "Satış talebin kapatıldı", Body = $"{row.ItemName} talebi KOTAKAS yönetimi tarafından kapatıldı. Detay için destek kaydı açabilirsin." });
            await db.SaveChangesAsync();
            UploadEndpoints.DeleteExistingImages(env, id);
            return Results.Ok(new { ok = true, status = row.Status });
        });

        moderation.MapPost("/listings/{id:long}/cancel", async (long id, AppDbContext db) =>
        {
            var row = await db.Listings.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            row.Status = "cancelled";
            db.Notifications.Add(new AppNotification { UserId = row.SellerUserId, Title = "SELL ilanın kapatıldı", Body = $"{row.ItemName} ilanı KOTAKAS yönetimi tarafından yayından kaldırıldı." });
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = row.Status });
        });

        moderation.MapDelete("/reviews/{id:long}", async (long id, AppDbContext db) =>
        {
            var row = await db.TraderReviews.FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            db.TraderReviews.Remove(row);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        });

        var full = app.MapGroup("/api/admin/moderation")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        full.MapPost("/users/{id}/close", async (string id, ClaimsPrincipal principal, UserManager<ApplicationUser> users, AppDbContext db) =>
        {
            var target = await users.FindByIdAsync(id);
            if (target is null) return Results.NotFound();
            if (target.Id == ApiHelpers.UserId(principal)) return Results.BadRequest(new { error = "cannot_close_self" });
            var roles = await users.GetRolesAsync(target);
            if (roles.Contains("admin_owner")) return Results.Forbid();
            if (roles.Any(x => x.StartsWith("admin_")) && !principal.IsInRole("admin_owner")) return Results.Forbid();

            target.AccountStatus = "deleted";
            target.VerifiedTrader = false;
            if (roles.Contains("trader"))
            {
                await users.RemoveFromRoleAsync(target, "trader");
                if (!await users.IsInRoleAsync(target, "user")) await users.AddToRoleAsync(target, "user");
            }

            var requests = await db.SaleRequests.Include(x => x.Offers).Where(x => x.UserId == id && x.Status == "open").ToListAsync();
            foreach (var request in requests)
            {
                request.Status = "cancelled";
                foreach (var offer in request.Offers.Where(x => x.Status == "active")) offer.Status = "declined";
            }
            foreach (var listing in await db.Listings.Where(x => x.SellerUserId == id && (x.Status == "active" || x.Status == "paused")).ToListAsync()) listing.Status = "cancelled";

            await users.UpdateAsync(target);
            await users.UpdateSecurityStampAsync(target);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, status = target.AccountStatus, financialHistoryPreserved = true });
        });

        full.MapPost("/users/{id}/restore", async (string id, ClaimsPrincipal principal, UserManager<ApplicationUser> users) =>
        {
            var target = await users.FindByIdAsync(id);
            if (target is null) return Results.NotFound();
            var roles = await users.GetRolesAsync(target);
            if (roles.Contains("admin_owner")) return Results.Forbid();
            if (roles.Any(x => x.StartsWith("admin_")) && !principal.IsInRole("admin_owner")) return Results.Forbid();
            target.AccountStatus = "active";
            await users.UpdateAsync(target);
            await users.UpdateSecurityStampAsync(target);
            return Results.Ok(new { ok = true, status = target.AccountStatus });
        });

        return app;
    }
}
