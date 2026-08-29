namespace Kotakas.Web.Models;

public sealed class TraderReview
{
    public long Id { get; set; }
    public long DealId { get; set; }
    public string TraderUserId { get; set; } = "";
    public string ReviewerUserId { get; set; } = "";
    public int Stars { get; set; }
    public string Comment { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
