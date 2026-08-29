using System.Net;
using System.Net.Mail;

namespace Kotakas.Web.Services;

public sealed class KotakasEmailSender(IConfiguration configuration, ILogger<KotakasEmailSender> logger)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(configuration["Email:SmtpHost"]) &&
        int.TryParse(configuration["Email:SmtpPort"], out _) &&
        !string.IsNullOrWhiteSpace(configuration["Email:From"]);

    public async Task<bool> SendAsync(string to, string subject, string html)
    {
        if (!IsConfigured) return false;
        try
        {
            var host = configuration["Email:SmtpHost"]!.Trim();
            var port = int.Parse(configuration["Email:SmtpPort"]!);
            var username = configuration["Email:SmtpUsername"]?.Trim();
            var password = configuration["Email:SmtpPassword"];
            var from = configuration["Email:From"]!.Trim();
            var fromName = configuration["Email:FromName"]?.Trim() ?? "KOTAKAS";
            var ssl = !string.Equals(configuration["Email:UseSsl"], "false", StringComparison.OrdinalIgnoreCase);

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = ssl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false
            };
            if (!string.IsNullOrWhiteSpace(username)) client.Credentials = new NetworkCredential(username, password ?? "");
            using var message = new MailMessage
            {
                From = new MailAddress(from, fromName),
                Subject = subject,
                Body = html,
                IsBodyHtml = true
            };
            message.To.Add(to);
            await client.SendMailAsync(message);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "KOTAKAS e-mail gönderimi başarısız: {Recipient}", to);
            return false;
        }
    }
}
