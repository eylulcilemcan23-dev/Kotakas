using System.Text.Json;
using Kotakas.Web.Api;
using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class TraderAvailabilityMiddleware(RequestDelegate next)
{
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
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = "trader_not_accepting_offers" }));
                return;
            }
        }

        await next(context);
    }
}
