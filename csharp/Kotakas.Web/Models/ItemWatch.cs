namespace Kotakas.Web.Models;

public sealed class ItemWatch
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string ServerCode { get; set; } = "ALL";
    public string Query { get; set; } = "";
    public decimal? MaxPriceGb { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
