using System.Security.Claims;
using System.Text.RegularExpressions;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;

namespace Kotakas.Web.Api;

public static class ApiHelpers
{
    public static string UserId(ClaimsPrincipal p) => p.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    public static bool IsFullAdmin(ClaimsPrincipal p) => p.IsInRole("admin_owner") || p.IsInRole("admin_full");
    public static bool IsAnyAdmin(ClaimsPrincipal p) => IsFullAdmin(p) || p.IsInRole("admin_limited");
    public static bool DealAccess(Deal d, ClaimsPrincipal p) => d.UserId == UserId(p) || d.TraderUserId == UserId(p) || IsAnyAdmin(p);
    public static bool HasExternalContact(string text) => Regex.IsMatch(text ?? "", @"https?://|www\.|wa\.me|whatsapp|telegram|t\.me|discord|instagram|@[a-z0-9_.]{3,}|(?:\+?90\s*)?0?5\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}", RegexOptions.IgnoreCase);
    public static async Task<object> UserDto(UserManager<ApplicationUser> users, ApplicationUser user)
    {
        var roles = await users.GetRolesAsync(user);
        return new { id = user.Id, email = user.Email, displayName = user.DisplayName, role = roles.FirstOrDefault() ?? "user", active = user.AccountStatus == "active", verifiedTrader = user.VerifiedTrader };
    }
    public static object RequestDto(SaleRequest x) => new { x.Id, x.ItemName, x.ServerCode, quantity = x.Quantity, minimumGb = x.MinimumGb, x.Note, x.Status, x.CreatedAt, offers = x.Offers.OrderByDescending(o => o.PriceGb).Select(o => new { o.Id, o.TraderName, o.PriceGb, o.ExpiryMinutes, o.Status }) };
}
