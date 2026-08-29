namespace Kotakas.Web.Models;

public sealed class AdminAuditEvent
{
    public long Id { get; set; }
    public string AdminUserId { get; set; } = "";
    public string Method { get; set; } = "";
    public string Path { get; set; } = "";
    public int StatusCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
