namespace Kotakas.Web.Models;

public sealed class NotificationPreference
{
    public string UserId { get; set; } = "";
    public bool OffersEnabled { get; set; } = true;
    public bool DealsEnabled { get; set; } = true;
    public bool FavoritesEnabled { get; set; } = true;
    public bool ItemWatchesEnabled { get; set; } = true;
    public bool MarketplaceEnabled { get; set; } = true;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
