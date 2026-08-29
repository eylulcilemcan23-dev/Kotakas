using System.Security.Claims;
using System.Text.RegularExpressions;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class ItemWatchEndpoints
{
    public static IEndpointRouteBuilder MapItemWatchEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/item-watches").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var watches = await db.ItemWatches.AsNoTracking().Where(x => x.UserId == uid).OrderByDescending(x => x.CreatedAt).ToListAsync();
            var activeListings = await db.Listings.AsNoTracking()
                .Where(x => x.Status == "active" && x.Stock > 0)
                .Select(x => new { x.Id, x.ItemName, x.ServerCode, x.PriceGb, x.Stock, x.SellerName })
                .ToListAsync();

            var rows = watches.Select(w =>
            {
                var matches = activeListings.Where(x =>
                    (w.ServerCode == "ALL" || x.ServerCode.Equals(w.ServerCode, StringComparison.OrdinalIgnoreCase)) &&
                    x.ItemName.Contains(w.Query, StringComparison.OrdinalIgnoreCase) &&
                    (!w.MaxPriceGb.HasValue || w.MaxPriceGb.Value <= 0 || x.PriceGb <= w.MaxPriceGb.Value)).ToList();
                var best = matches.Count == 0 ? (decimal?)null : matches.Min(x => x.PriceGb);
                return new { w.Id, w.ServerCode, w.Query, w.MaxPriceGb, w.CreatedAt, matchCount = matches.Count, bestPriceGb = best };
            }).ToList();
            return Results.Ok(new { watches = rows, limit = 20 });
        });

        group.MapPost("/", async (ClaimsPrincipal principal, ItemWatchInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var validated = Validate(input);
            if (validated.Error is not null) return Results.BadRequest(new { error = validated.Error });

            var existing = await db.ItemWatches.FirstOrDefaultAsync(x => x.UserId == uid && x.ServerCode == validated.ServerCode && x.Query == validated.Query);
            if (existing is not null)
            {
                existing.MaxPriceGb = validated.MaxPriceGb;
                await db.SaveChangesAsync();
                return Results.Ok(new { ok = true, watch = existing, updated = true });
            }

            if (await db.ItemWatches.CountAsync(x => x.UserId == uid) >= 20)
                return Results.Conflict(new { error = "item_watch_limit_reached", limit = 20 });

            var row = new ItemWatch { UserId = uid, ServerCode = validated.ServerCode!, Query = validated.Query!, MaxPriceGb = validated.MaxPriceGb };
            db.ItemWatches.Add(row);
            await db.SaveChangesAsync();
            return Results.Json(new { ok = true, watch = row }, statusCode: 201);
        });

        group.MapPatch("/{id:long}", async (long id, ClaimsPrincipal principal, ItemWatchInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var row = await db.ItemWatches.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid);
            if (row is null) return Results.NotFound();
            var validated = Validate(input);
            if (validated.Error is not null) return Results.BadRequest(new { error = validated.Error });
            var duplicate = await db.ItemWatches.AnyAsync(x => x.UserId == uid && x.Id != id && x.ServerCode == validated.ServerCode && x.Query == validated.Query);
            if (duplicate) return Results.Conflict(new { error = "item_watch_duplicate" });
            row.ServerCode = validated.ServerCode!;
            row.Query = validated.Query!;
            row.MaxPriceGb = validated.MaxPriceGb;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, watch = row });
        });

        group.MapDelete("/{id:long}", async (long id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var row = await db.ItemWatches.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid);
            if (row is null) return Results.Ok(new { ok = true });
            db.ItemWatches.Remove(row);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        });

        return app;
    }

    private static (string? ServerCode, string? Query, decimal? MaxPriceGb, string? Error) Validate(ItemWatchInput input)
    {
        var server = (input.ServerCode ?? "ALL").Trim().ToUpperInvariant();
        var query = Regex.Replace((input.Query ?? "").Trim(), @"\s+", " ");
        if (!Regex.IsMatch(server, @"^(ALL|[A-Z0-9_-]{2,20})$")) return (null, null, null, "invalid_server");
        if (query.Length < 2 || query.Length > 60 || ApiHelpers.HasExternalContact(query)) return (null, null, null, "invalid_item_watch_query");
        var max = input.MaxPriceGb;
        if (max.HasValue && (max.Value < 0 || max.Value > 100000)) return (null, null, null, "invalid_max_price");
        if (max == 0) max = null;
        return (server, query, max, null);
    }
}

public sealed record ItemWatchInput(string? ServerCode, string? Query, decimal? MaxPriceGb);
