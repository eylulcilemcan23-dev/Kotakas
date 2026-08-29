namespace Kotakas.Web.Models;

public sealed class SupportReply
{
    public long Id { get; set; }
    public long TicketId { get; set; }
    public string SenderUserId { get; set; } = "";
    public string SenderRole { get; set; } = "user";
    public string Message { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
