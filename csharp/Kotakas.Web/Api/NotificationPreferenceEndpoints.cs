using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class NotificationPreferenceEndpoints
{
    public static IEndpointRouteBuilder MapNotificationPreferenceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/notification-preferences", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var pref = await db.NotificationPreferences.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == uid);
            return Results.Ok(new { preferences = Dto(pref) });
        }).RequireAuthorization();

        app.MapPut("/api/notification-preferences", async (ClaimsPrincipal principal, NotificationPreferenceInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var pref = await db.NotificationPreferences.FirstOrDefaultAsync(x => x.UserId == uid);
            if (pref is null)
            {
                pref = new NotificationPreference { UserId = uid };
                db.NotificationPreferences.Add(pref);
            }
            pref.OffersEnabled = input.OffersEnabled;
            pref.DealsEnabled = input.DealsEnabled;
            pref.FavoritesEnabled = input.FavoritesEnabled;
            pref.ItemWatchesEnabled = input.ItemWatchesEnabled;
            pref.MarketplaceEnabled = input.MarketplaceEnabled;
            pref.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, preferences = Dto(pref) });
        }).RequireAuthorization();

        return app;
    }

    public static bool IsVisible(AppNotification notification, NotificationPreference? pref)
    {
        if (pref is null) return true;
        var category = Category(notification.Title);
        return category switch
        {
            "offers" => pref.OffersEnabled,
            "deals" => pref.DealsEnabled,
            "favorites" => pref.FavoritesEnabled,
            "item_watches" => pref.ItemWatchesEnabled,
            "marketplace" => pref.MarketplaceEnabled,
            _ => true // sistem, güvenlik, ödeme ve hesap bildirimleri kapatılamaz
        };
    }

    public static string Category(string? title)
    {
        var value = (title ?? "").Trim().ToLowerInvariant();
        if (value.Contains("favori")) return "favorites";
        if (value.Contains("item alarm") || value.Contains("takip ettiğin item")) return "item_watches";
        if (value.Contains("teklif")) return "offers";
        if (value.Contains("yeni satış talebi")) return "marketplace";
        if (value.Contains("işlem") || value.Contains("teslim") || value.Contains("anlaşmaz") || value.Contains("emanet")) return "deals";
        return "system";
    }

    private static object Dto(NotificationPreference? pref) => new
    {
        offersEnabled = pref?.OffersEnabled ?? true,
        dealsEnabled = pref?.DealsEnabled ?? true,
        favoritesEnabled = pref?.FavoritesEnabled ?? true,
        itemWatchesEnabled = pref?.ItemWatchesEnabled ?? true,
        marketplaceEnabled = pref?.MarketplaceEnabled ?? true,
        systemEnabled = true
    };
}

public record NotificationPreferenceInput(
    bool OffersEnabled,
    bool DealsEnabled,
    bool FavoritesEnabled,
    bool ItemWatchesEnabled,
    bool MarketplaceEnabled);
