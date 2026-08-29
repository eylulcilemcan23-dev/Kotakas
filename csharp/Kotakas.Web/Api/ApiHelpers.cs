using System.Security.Claims;
using System.Globalization;
using System.Text.RegularExpressions;
using Kotakas.Web.Models;
using Kotakas.Web.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ApiHelpers
{
    public static string UserId(ClaimsPrincipal p) => p.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    public static bool IsFullAdmin(ClaimsPrincipal p) => p.IsInRole("admin_owner") || p.IsInRole("admin_full");
    public static bool IsAnyAdmin(ClaimsPrincipal p) => IsFullAdmin(p) || p.IsInRole("admin_limited");
    public static bool DealAccess(Deal d, ClaimsPrincipal p) => d.UserId == UserId(p) || d.TraderUserId == UserId(p) || IsAnyAdmin(p);
    public static string DealSellerUserId(Deal d) => d.Flow == "trader_listing" ? d.TraderUserId : d.UserId;
    public static string DealBuyerUserId(Deal d) => d.Flow == "trader_listing" ? d.UserId : d.TraderUserId;
    public static bool HasExternalContact(string text) => Regex.IsMatch(text ?? "", @"https?://|www\.|wa\.me|whatsapp|telegram|t\.me|discord|instagram|@[a-z0-9_.]{3,}|(?:\+?90\s*)?0?5\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}", RegexOptions.IgnoreCase);
    public static async Task<decimal> SettingDecimal(AppDbContext db, string key, decimal fallback = 0m)
    {
        var row = await db.SiteSettings.FindAsync(key);
        return decimal.TryParse(row?.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }

    public static async Task<Wallet> WalletFor(AppDbContext db, string userId)
    {
        var wallet = await db.Wallets.FirstOrDefaultAsync(x => x.UserId == userId);
        if (wallet is not null) return wallet;
        wallet = new Wallet { UserId = userId };
        db.Wallets.Add(wallet);
        return wallet;
    }
    public static async Task<object> UserDto(UserManager<ApplicationUser> users, ApplicationUser user)
    {
        var roles = await users.GetRolesAsync(user);
        return new
        {
            id = user.Id,
            email = user.Email,
            displayName = user.DisplayName,
            role = roles.FirstOrDefault() ?? "user",
            active = user.AccountStatus == "active",
            userVerified = user.UserVerified,
            userVerifiedAt = user.UserVerifiedAt,
            verifiedTrader = user.VerifiedTrader
        };
    }
    public static object RequestDto(SaleRequest x) => new
    {
        x.Id,
        x.ItemName,
        x.ServerCode,
        quantity = x.Quantity,
        minimumGb = x.MinimumGb,
        x.Note,
        x.Status,
        x.CreatedAt,
        offers = x.Offers.OrderByDescending(o => o.PriceGb).Select(o => new
        {
            o.Id,
            traderUserId = o.TraderUserId,
            o.TraderName,
            o.PriceGb,
            o.ExpiryMinutes,
            o.Status
        })
    };
}
