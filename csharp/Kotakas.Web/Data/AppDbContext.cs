using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<SaleRequest> SaleRequests => Set<SaleRequest>();
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<AppNotification> Notifications => Set<AppNotification>();
    public DbSet<TraderApplication> TraderApplications => Set<TraderApplication>();
    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<TraderListing> Listings => Set<TraderListing>();
    public DbSet<WalletLedger> WalletLedgers => Set<WalletLedger>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();
    public DbSet<SupportTicket> SupportTickets => Set<SupportTicket>();
    public DbSet<DealMessage> DealMessages => Set<DealMessage>();
    public DbSet<PaymentIntent> PaymentIntents => Set<PaymentIntent>();
    public DbSet<TraderReview> TraderReviews => Set<TraderReview>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<ItemWatch> ItemWatches => Set<ItemWatch>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<SaleRequest>().Property(x => x.MinimumGb).HasPrecision(18, 4);
        b.Entity<Offer>().Property(x => x.PriceGb).HasPrecision(18, 4);
        b.Entity<Deal>().Property(x => x.UnitPriceGb).HasPrecision(18, 4);
        b.Entity<Deal>().Property(x => x.PriceGb).HasPrecision(18, 4);
        b.Entity<Deal>().Property(x => x.GbTryRate).HasPrecision(18, 4);
        b.Entity<Deal>().Property(x => x.GrossTry).HasPrecision(18, 2);
        b.Entity<Deal>().Property(x => x.EscrowTry).HasPrecision(18, 2);
        b.Entity<Deal>().Property(x => x.CommissionPercent).HasPrecision(8, 4);
        b.Entity<Deal>().Property(x => x.CommissionTry).HasPrecision(18, 2);
        b.Entity<Deal>().Property(x => x.SellerNetTry).HasPrecision(18, 2);
        b.Entity<Wallet>().Property(x => x.BalanceTry).HasPrecision(18, 2);
        b.Entity<TraderListing>().Property(x => x.PriceGb).HasPrecision(18, 4);
        b.Entity<WalletLedger>().Property(x => x.AmountTry).HasPrecision(18, 2);
        b.Entity<WalletLedger>().Property(x => x.BeforeTry).HasPrecision(18, 2);
        b.Entity<WalletLedger>().Property(x => x.AfterTry).HasPrecision(18, 2);
        b.Entity<PaymentIntent>().Property(x => x.AmountTry).HasPrecision(18, 2);
        b.Entity<ItemWatch>().Property(x => x.MaxPriceGb).HasPrecision(18, 4);
        b.Entity<SiteSetting>().HasKey(x => x.Key);
        b.Entity<SaleRequest>().HasMany(x => x.Offers).WithOne(x => x.SaleRequest).HasForeignKey(x => x.SaleRequestId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<SaleRequest>().HasIndex(x => new { x.Status, x.ServerCode, x.CreatedAt });
        b.Entity<Offer>().HasIndex(x => new { x.SaleRequestId, x.TraderUserId });
        b.Entity<Deal>().HasIndex(x => new { x.Flow, x.Status, x.CreatedAt });
        b.Entity<Deal>().HasIndex(x => x.TraderListingId);
        b.Entity<AppNotification>().HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt });
        b.Entity<TraderApplication>().HasIndex(x => new { x.UserId, x.Status });
        b.Entity<Wallet>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<TraderListing>().HasIndex(x => new { x.Status, x.ServerCode, x.CreatedAt });
        b.Entity<WalletLedger>().HasIndex(x => new { x.UserId, x.CreatedAt });
        b.Entity<SupportTicket>().HasIndex(x => new { x.Status, x.Priority, x.CreatedAt });
        b.Entity<DealMessage>().HasIndex(x => new { x.DealId, x.CreatedAt });
        b.Entity<PaymentIntent>().HasIndex(x => x.ConversationId).IsUnique();
        b.Entity<PaymentIntent>().HasIndex(x => new { x.UserId, x.Purpose, x.Status, x.CreatedAt });
        b.Entity<PaymentIntent>().HasIndex(x => x.ProviderToken);
        b.Entity<TraderReview>().HasIndex(x => x.DealId).IsUnique();
        b.Entity<TraderReview>().HasIndex(x => new { x.TraderUserId, x.CreatedAt });
        b.Entity<Favorite>().HasIndex(x => new { x.UserId, x.TargetType, x.TargetId }).IsUnique();
        b.Entity<Favorite>().HasIndex(x => new { x.TargetType, x.TargetId, x.CreatedAt });
        b.Entity<ItemWatch>().HasIndex(x => new { x.UserId, x.ServerCode, x.Query }).IsUnique();
        b.Entity<ItemWatch>().HasIndex(x => new { x.ServerCode, x.Query, x.CreatedAt });
    }
}
