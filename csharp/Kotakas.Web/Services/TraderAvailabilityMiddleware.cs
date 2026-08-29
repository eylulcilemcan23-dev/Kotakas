using System.Text.Json;
using System.Text.RegularExpressions;
using Kotakas.Web.Api;
using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class TraderAvailabilityMiddleware(RequestDelegate next)
{
    private static readonly Regex AcceptOfferPath = new("^/api/offers/(?<id>\\d+)/accept/?$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (HttpMethods.IsPost(context.Request.Method)
            && context.Request.Path.StartsWithSegments("/api/sale-requests")
            && context.Request.Path.Value?.EndsWith("/offers", StringComparison.OrdinalIgnoreCase) == true
            && context.User.Identity?.IsAuthenticated == true)
        {
            var uid = ApiHelpers.UserId(context.User);
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == uid);
            if (user is not null && user.VerifiedTrader && !user.TraderAcceptingOffers && !ApiHelpers.IsAnyAdmin(context.User))
            {
                await JsonError(context, StatusCodes.Status409Conflict, "trader_not_accepting_offers");
                return;
            }
        }

        if (HttpMethods.IsPost(context.Request.Method) && context.User.Identity?.IsAuthenticated == true)
        {
            var match = AcceptOfferPath.Match(context.Request.Path.Value ?? "");
            if (match.Success && long.TryParse(match.Groups["id"].Value, out var offerId))
            {
                var offer = await db.Offers.FirstOrDefaultAsync(x => x.Id == offerId);
                if (offer is not null && offer.Status == "active" && offer.CreatedAt.AddMinutes(Math.Clamp(offer.ExpiryMinutes, 5, 1440)) <= DateTimeOffset.UtcNow)
                {
                    offer.Status = "expired";
                    await db.SaveChangesAsync();
                    await JsonError(context, StatusCodes.Status409Conflict, "offer_expired");
                    return;
                }
            }
        }

        await next(context);
    }

    private static async Task JsonError(HttpContext context, int status, string error)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { error }));
    }
}
