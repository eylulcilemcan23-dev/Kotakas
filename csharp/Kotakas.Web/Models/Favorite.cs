namespace Kotakas.Web.Models;

public sealed class Favorite
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public string TargetType { get; set; } = "listing"; // listing | trader
    public string TargetId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
