using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Models;

[Index(nameof(ListingId), nameof(CreatedAt))]
public sealed class ListingPriceHistory
{
    public long Id { get; set; }
    public long ListingId { get; set; }
    [Precision(18, 4)]
    public decimal PriceGb { get; set; }
    public string Reason { get; set; } = "update";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    [JsonIgnore]
    public TraderListing? Listing { get; set; }
}

[Index(nameof(ListingId), nameof(Status), nameof(ExpiresAt))]
[Index(nameof(BuyerUserId), nameof(Status), nameof(CreatedAt))]
[Index(nameof(ListingId), nameof(BuyerUserId), nameof(Status))]
public sealed class ListingPriceOffer
{
    public long Id { get; set; }
    public long ListingId { get; set; }
    public string BuyerUserId { get; set; } = "";
    public string BuyerName { get; set; } = "";
    public int Quantity { get; set; } = 1;
    [Precision(18, 4)]
    public decimal OfferGbPerUnit { get; set; }
    public string Status { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(30);
    public DateTimeOffset? RespondedAt { get; set; }
    public long? PurchasedDealId { get; set; }
    [JsonIgnore]
    public TraderListing? Listing { get; set; }
}
