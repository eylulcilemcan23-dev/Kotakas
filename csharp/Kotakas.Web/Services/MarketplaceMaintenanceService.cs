using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class MarketplaceMaintenanceService(IServiceScopeFactory scopes, ILogger<MarketplaceMaintenanceService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var now = DateTimeOffset.UtcNow;

                var activeOffers = await db.Offers.Include(x => x.SaleRequest)
                    .Where(x => x.Status == "active")
                    .ToListAsync(stoppingToken);
                var expired = activeOffers
                    .Where(x => x.CreatedAt.AddMinutes(Math.Clamp(x.ExpiryMinutes, 5, 1440)) <= now)
                    .ToList();
                foreach (var offer in expired)
                {
                    offer.Status = "expired";
                    db.Notifications.Add(new AppNotification
                    {
                        UserId = offer.TraderUserId,
                        Title = "Teklif süresi doldu",
                        Body = offer.SaleRequest is null
                            ? "Aktif tekliflerinden birinin süresi doldu."
                            : $"{offer.SaleRequest.ItemName} için verdiğin {offer.PriceGb:0.##} GB teklifin süresi doldu."
                    });
                }

                // SQLite does not translate DateTimeOffset comparison for this entity reliably.
                // Filter by status in SQL, then apply the expiry cutoff in memory. PostgreSQL uses
                // the same path so maintenance behavior stays provider-neutral.
                var priceOfferCandidates = await db.Set<ListingPriceOffer>().Include(x => x.Listing)
                    .Where(x => x.Status == "pending" || x.Status == "accepted")
                    .ToListAsync(stoppingToken);
                var listingPriceOffers = priceOfferCandidates.Where(x => x.ExpiresAt <= now).ToList();
                foreach (var offer in listingPriceOffers)
                {
                    var wasAccepted = offer.Status == "accepted";
                    offer.Status = "expired";
                    db.Notifications.Add(new AppNotification
                    {
                        UserId = offer.BuyerUserId,
                        Title = wasAccepted ? "Kabul edilen fiyat teklifinin süresi doldu" : "Fiyat teklifinin süresi doldu",
                        Body = offer.Listing is null
                            ? "SELL ilanına verdiğin fiyat teklifinin süresi doldu."
                            : $"{offer.Listing.ItemName} için {offer.OfferGbPerUnit:0.##} GB/adet teklifin artık geçerli değil."
                    });
                }

                var soldOutListings = await db.Listings
                    .Where(x => x.Status == "active" && x.Stock <= 0)
                    .ToListAsync(stoppingToken);
                foreach (var listing in soldOutListings) listing.Status = "sold_out";

                if (expired.Count > 0 || listingPriceOffers.Count > 0 || soldOutListings.Count > 0)
                    await db.SaveChangesAsync(stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(ex, "KOTAKAS marketplace maintenance cycle failed.");
            }

            try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
            catch (OperationCanceledException) { }
        }
    }
}
