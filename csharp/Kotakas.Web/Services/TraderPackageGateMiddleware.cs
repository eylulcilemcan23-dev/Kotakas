using Kotakas.Web.Api;
using Kotakas.Web.Data;

namespace Kotakas.Web.Services;

public sealed class TraderPackageGateMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (!HttpMethods.IsPost(context.Request.Method) ||
            !context.Request.Path.Equals("/api/listings", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var principal = context.User;
        if (ApiHelpers.IsFullAdmin(principal))
        {
            await next(context);
            return;
        }

        if (!principal.Identity?.IsAuthenticated == true || !principal.IsInRole("trader"))
        {
            await next(context);
            return;
        }

        var userId = ApiHelpers.UserId(principal);
        var active = await TraderPackageStore.GetActiveAsync(db, userId);
        if (active is null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new
            {
                error = "package_required",
                message = "Satış ilanı açmak için aktif pazarcı paketi gerekli."
            });
            return;
        }

        if (active.ListingLimit >= 0 && active.ListingsUsed >= active.ListingLimit)
        {
            context.Response.StatusCode = StatusCodes.Status409Conflict;
            await context.Response.WriteAsJsonAsync(new
            {
                error = "listing_limit_reached",
                message = "Paketindeki ilan hakkı doldu.",
                active.PackageCode,
                active.ListingLimit,
                active.ListingsUsed
            });
            return;
        }

        await next(context);

        if (context.Response.StatusCode is >= 200 and < 300)
            await TraderPackageStore.IncrementUsageAsync(db, active.Id);
    }
}
