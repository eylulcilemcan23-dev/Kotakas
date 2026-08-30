using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Kotakas.Web.Services;

public sealed class ListingHistoryInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        AddInitialRows(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        AddInitialRows(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static void AddInitialRows(DbContext? context)
    {
        if (context is null) return;
        var addedListings = context.ChangeTracker.Entries<TraderListing>()
            .Where(x => x.State == EntityState.Added)
            .Select(x => x.Entity)
            .ToList();
        if (addedListings.Count == 0) return;

        var trackedListings = context.ChangeTracker.Entries<ListingPriceHistory>()
            .Where(x => x.State == EntityState.Added && x.Entity.Listing is not null)
            .Select(x => x.Entity.Listing)
            .ToHashSet();

        foreach (var listing in addedListings)
        {
            if (trackedListings.Contains(listing)) continue;
            context.Set<ListingPriceHistory>().Add(new ListingPriceHistory
            {
                Listing = listing,
                PriceGb = listing.PriceGb,
                Reason = "initial",
                CreatedAt = listing.CreatedAt
            });
        }
    }
}
