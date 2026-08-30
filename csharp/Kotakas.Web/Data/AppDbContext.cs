using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Kotakas.Web.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<ApplicationUser>(options)
{
    public bool SuppressAutomation { get; set; }

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
    public DbSet<SupportReply> SupportReplies => Set<SupportReply>();
    public DbSet<DealMessage> DealMessages => Set<DealMessage>();
    public DbSet<PaymentIntent> PaymentIntents => Set<PaymentIntent>();
    public DbSet<TraderReview> TraderReviews => Set<TraderReview>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<ItemWatch> ItemWatches => Set<ItemWatch>();
    public DbSet<UserReport> UserReports => Set<UserReport>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<VerificationRequest> VerificationRequests => Set<VerificationRequest>();
    public DbSet<AdminAuditEvent> AdminAuditEvents => Set<AdminAuditEvent>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<RiskSignal> RiskSignals => Set<RiskSignal>();

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        if (!SuppressAutomation)
        {
            await FilterClosedTraderRequestNotifications(cancellationToken);
            if (Database.IsNpgsql()) await AddPostgresListingNotifications(cancellationToken);
        }
        return await base.SaveChangesAsync(cancellationToken);
    }

    private async Task FilterClosedTraderRequestNotifications(CancellationToken cancellationToken)
    {
        var added = ChangeTracker.Entries<AppNotification>()
            .Where(x => x.State == EntityState.Added && x.Entity.Title == "Yeni satış talebi")
            .ToList();
        if (added.Count == 0) return;

        var ids = added.Select(x => x.Entity.UserId).Distinct().ToList();
        var closed = await Users.AsNoTracking()
            .Where(x => ids.Contains(x.Id) && x.VerifiedTrader && !x.TraderAcceptingOffers)
            .Select(x => x.Id).ToListAsync(cancellationToken);
        if (closed.Count == 0) return;
        var set = closed.ToHashSet(StringComparer.Ordinal);
        foreach (var entry in added.Where(x => set.Contains(x.Entity.UserId))) entry.State = EntityState.Detached;
    }

    private async Task AddPostgresListingNotifications(CancellationToken cancellationToken)
    {
        var entries = ChangeTracker.Entries<TraderListing>()
            .Where(x => x.State is EntityState.Added or EntityState.Modified)
            .ToList();
        if (entries.Count == 0) return;

        foreach (var entry in entries)
        {
            var listing = entry.Entity;
            if (entry.State == EntityState.Added && listing.Status == "active" && listing.Stock > 0)
            {
                var followers = await Favorites.AsNoTracking()
                    .Where(x => x.TargetType == "trader" && x.TargetId == listing.SellerUserId && x.UserId != listing.SellerUserId)
                    .Select(x => x.UserId).Distinct().ToListAsync(cancellationToken);
                Notifications.AddRange(followers.Select(uid => new AppNotification
                {
                    UserId = uid,
                    Title = "Favori pazarcın yeni ilan açtı",
                    Body = $"{listing.SellerName} • {listing.ItemName} • {listing.PriceGb:0.##} GB"
                }));

                var watches = await ItemWatches.AsNoTracking()
                    .Where(x => (x.ServerCode == "ALL" || x.ServerCode == listing.ServerCode) && x.UserId != listing.SellerUserId)
                    .ToListAsync(cancellationToken);
                foreach (var watch in watches.Where(x =>
                             listing.ItemName.Contains(x.Query, StringComparison.OrdinalIgnoreCase) &&
                             (!x.MaxPriceGb.HasValue || x.MaxPriceGb.Value <= 0 || listing.PriceGb <= x.MaxPriceGb.Value)))
                {
                    Notifications.Add(new AppNotification
                    {
                        UserId = watch.UserId,
                        Title = "Takip ettiğin item için yeni ilan",
                        Body = $"{listing.ServerCode} • {listing.ItemName} • {listing.PriceGb:0.##} GB • {listing.SellerName}"
                    });
                }
            }

            if (entry.State == EntityState.Modified && entry.Property(x => x.PriceGb).IsModified)
            {
                var oldPrice = entry.Property(x => x.PriceGb).OriginalValue;
                var newPrice = listing.PriceGb;
                if (newPrice >= oldPrice) continue;

                var favoriteUsers = await Favorites.AsNoTracking()
                    .Where(x => x.TargetType == "listing" && x.TargetId == listing.Id.ToString() && x.UserId != listing.SellerUserId)
                    .Select(x => x.UserId).Distinct().ToListAsync(cancellationToken);
                Notifications.AddRange(favoriteUsers.Select(uid => new AppNotification
                {
                    UserId = uid,
                    Title = "Favorindeki ilanın fiyatı düştü",
                    Body = $"{listing.ItemName} artık {newPrice:0.##} GB. Eski fiyat: {oldPrice:0.##} GB."
                }));

                var watches = await ItemWatches.AsNoTracking()
                    .Where(x => (x.ServerCode == "ALL" || x.ServerCode == listing.ServerCode) && x.UserId != listing.SellerUserId && x.MaxPriceGb != null)
                    .ToListAsync(cancellationToken);
                foreach (var watch in watches.Where(x =>
                             x.MaxPriceGb > 0 && newPrice <= x.MaxPriceGb && oldPrice > x.MaxPriceGb &&
                             listing.ItemName.Contains(x.Query, StringComparison.OrdinalIgnoreCase)))
                {
                    Notifications.Add(new AppNotification
                    {
                        UserId = watch.UserId,
                        Title = "Item alarmındaki fiyat geldi",
                        Body = $"{listing.ServerCode} • {listing.ItemName} artık {newPrice:0.##} GB."
                    });
                }
            }
        }
    }

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
        b.Entity<RiskSignal>().Property(x => x.AmountTry).HasPrecision(18, 2);
        b.Entity<SiteSetting>().HasKey(x => x.Key);
        b.Entity<NotificationPreference>().HasKey(x => x.UserId);
        b.Entity<SaleRequest>().HasMany(x => x.Offers).WithOne(x => x.SaleRequest).HasForeignKey(x => x.SaleRequestId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<SaleRequest>().HasIndex(x => new { x.Status, x.ServerCode, x.CreatedAt });
        b.Entity<SaleRequest>().HasIndex(x => new { x.UserId, x.Status, x.CreatedAt });
        b.Entity<Offer>().HasIndex(x => new { x.SaleRequestId, x.TraderUserId });
        b.Entity<Deal>().HasIndex(x => new { x.Flow, x.Status, x.CreatedAt });
        b.Entity<Deal>().HasIndex(x => new { x.Status, x.CreatedAt });
        b.Entity<Deal>().HasIndex(x => new { x.UserId, x.Status, x.CreatedAt });
        b.Entity<Deal>().HasIndex(x => new { x.TraderUserId, x.Status, x.CreatedAt });
        b.Entity<Deal>().HasIndex(x => x.TraderListingId);
        b.Entity<AppNotification>().HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt });
        b.Entity<TraderApplication>().HasIndex(x => new { x.UserId, x.Status });
        b.Entity<Wallet>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<TraderListing>().HasIndex(x => new { x.Status, x.ServerCode, x.CreatedAt });
        b.Entity<TraderListing>().HasIndex(x => new { x.SellerUserId, x.Status, x.CreatedAt });
        b.Entity<WalletLedger>().HasIndex(x => new { x.UserId, x.CreatedAt });
        b.Entity<WalletLedger>().HasIndex(x => new { x.Type, x.CreatedAt });
        b.Entity<WalletLedger>().HasIndex(x => new { x.AdminUserId, x.CreatedAt });
        b.Entity<SupportTicket>().HasIndex(x => new { x.Status, x.Priority, x.CreatedAt });
        b.Entity<SupportReply>().HasIndex(x => new { x.TicketId, x.CreatedAt });
        b.Entity<DealMessage>().HasIndex(x => new { x.DealId, x.CreatedAt });
        b.Entity<PaymentIntent>().HasIndex(x => x.ConversationId).IsUnique();
        b.Entity<PaymentIntent>().HasIndex(x => new { x.UserId, x.Purpose, x.Status, x.CreatedAt });
        b.Entity<PaymentIntent>().HasIndex(x => new { x.Status, x.CreatedAt });
        b.Entity<PaymentIntent>().HasIndex(x => x.ProviderToken);
        b.Entity<TraderReview>().HasIndex(x => x.DealId).IsUnique();
        b.Entity<TraderReview>().HasIndex(x => new { x.TraderUserId, x.CreatedAt });
        b.Entity<Favorite>().HasIndex(x => new { x.UserId, x.TargetType, x.TargetId }).IsUnique();
        b.Entity<Favorite>().HasIndex(x => new { x.TargetType, x.TargetId, x.CreatedAt });
        b.Entity<ItemWatch>().HasIndex(x => new { x.UserId, x.ServerCode, x.Query }).IsUnique();
        b.Entity<ItemWatch>().HasIndex(x => new { x.ServerCode, x.Query, x.CreatedAt });
        b.Entity<UserReport>().HasIndex(x => new { x.Status, x.CreatedAt });
        b.Entity<UserReport>().HasIndex(x => new { x.ReporterUserId, x.TargetType, x.TargetId, x.Status });
        b.Entity<VerificationRequest>().HasIndex(x => new { x.Status, x.CreatedAt });
        b.Entity<VerificationRequest>().HasIndex(x => new { x.UserId, x.Kind, x.Status });
        b.Entity<AdminAuditEvent>().HasIndex(x => new { x.AdminUserId, x.CreatedAt });
        b.Entity<AdminAuditEvent>().HasIndex(x => new { x.Method, x.Path, x.CreatedAt });
        b.Entity<IdempotencyRecord>().HasIndex(x => new { x.UserId, x.Scope, x.RequestKey }).IsUnique();
        b.Entity<IdempotencyRecord>().HasIndex(x => x.CreatedAt);
        b.Entity<UserSession>().HasIndex(x => new { x.UserId, x.DeviceId }).IsUnique();
        b.Entity<UserSession>().HasIndex(x => new { x.UserId, x.LastSeenAt });
        b.Entity<RiskSignal>().HasIndex(x => x.Fingerprint).IsUnique();
        b.Entity<RiskSignal>().HasIndex(x => new { x.Status, x.Severity, x.LastDetectedAt });
        b.Entity<RiskSignal>().HasIndex(x => new { x.SubjectUserId, x.LastDetectedAt });
        b.Entity<RiskSignal>().HasIndex(x => new { x.Code, x.Status, x.LastDetectedAt });
    }
}
