using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using Kotakas.Web.Models;
using Kotakas.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;

namespace Kotakas.Web.Api;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/register", async (RegisterRequest input, HttpContext http, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, KotakasEmailSender emailSender, IConfiguration configuration) =>
        {
            var email = (input.Email ?? "").Trim().ToLowerInvariant();
            var name = (input.DisplayName ?? "").Trim();
            if (name.Length < 2 || !email.Contains('@') || (input.Password ?? "").Length < 8)
                return Results.BadRequest(new { error = "invalid_registration" });
            if (await users.FindByEmailAsync(email) is not null)
                return Results.Conflict(new { error = "email_already_registered" });

            var requiresConfirmation = emailSender.IsConfigured;
            var user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                DisplayName = name,
                EmailConfirmed = !requiresConfirmation
            };
            var result = await users.CreateAsync(user, input.Password!);
            if (!result.Succeeded)
                return Results.BadRequest(new { error = "registration_failed", details = result.Errors.Select(x => x.Description) });
            await users.AddToRoleAsync(user, "user");

            if (requiresConfirmation)
            {
                await SendConfirmationAsync(user, http, users, emailSender, configuration);
                return Results.Json(new { ok = true, requiresEmailConfirmation = true }, statusCode: 201);
            }

            await signIn.SignInAsync(user, true);
            return Results.Json(new { ok = true, user = await ApiHelpers.UserDto(users, user), requiresEmailConfirmation = false }, statusCode: 201);
        });

        app.MapPost("/api/login", async (LoginRequest input, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, KotakasEmailSender emailSender) =>
        {
            var user = await users.FindByEmailAsync((input.Email ?? "").Trim().ToLowerInvariant());
            if (user is null || user.AccountStatus != "active")
                return Results.Json(new { error = "invalid_credentials" }, statusCode: 401);
            if (emailSender.IsConfigured && !user.EmailConfirmed)
                return Results.Json(new { error = "email_not_confirmed" }, statusCode: 403);

            var result = await signIn.PasswordSignInAsync(user, input.Password ?? "", true, true);
            if (result.IsLockedOut) return Results.Json(new { error = "account_temporarily_locked" }, statusCode: 423);
            return result.Succeeded
                ? Results.Ok(new { ok = true, user = await ApiHelpers.UserDto(users, user) })
                : Results.Json(new { error = "invalid_credentials" }, statusCode: 401);
        });

        app.MapPost("/api/auth/resend-confirmation", async (EmailOnlyInput input, HttpContext http, UserManager<ApplicationUser> users, KotakasEmailSender emailSender, IConfiguration configuration) =>
        {
            if (!emailSender.IsConfigured) return Results.Ok(new { ok = true, emailDeliveryConfigured = false });
            var email = (input.Email ?? "").Trim().ToLowerInvariant();
            var user = await users.FindByEmailAsync(email);
            if (user is not null && user.AccountStatus == "active" && !user.EmailConfirmed)
                await SendConfirmationAsync(user, http, users, emailSender, configuration);
            return Results.Ok(new { ok = true, emailDeliveryConfigured = true });
        });

        app.MapGet("/api/auth/confirm-email", async (string? uid, string? token, UserManager<ApplicationUser> users) =>
        {
            if (string.IsNullOrWhiteSpace(uid) || string.IsNullOrWhiteSpace(token))
                return Results.Redirect("/login.html?email=confirm_failed");
            var user = await users.FindByIdAsync(uid);
            if (user is null) return Results.Redirect("/login.html?email=confirm_failed");
            try
            {
                var decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
                var result = await users.ConfirmEmailAsync(user, decoded);
                return Results.Redirect(result.Succeeded ? "/login.html?email=confirmed" : "/login.html?email=confirm_failed");
            }
            catch
            {
                return Results.Redirect("/login.html?email=confirm_failed");
            }
        });

        app.MapPost("/api/auth/forgot-password", async (EmailOnlyInput input, HttpContext http, UserManager<ApplicationUser> users, KotakasEmailSender emailSender, IConfiguration configuration) =>
        {
            var email = (input.Email ?? "").Trim().ToLowerInvariant();
            if (!emailSender.IsConfigured) return Results.Ok(new { ok = true, emailDeliveryConfigured = false });
            var user = await users.FindByEmailAsync(email);
            if (user is not null && user.AccountStatus == "active" && user.EmailConfirmed)
            {
                var token = await users.GeneratePasswordResetTokenAsync(user);
                var encoded = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
                var baseUrl = PublicBaseUrl(http, configuration);
                var url = $"{baseUrl}/reset-password.html?uid={Uri.EscapeDataString(user.Id)}&token={Uri.EscapeDataString(encoded)}";
                var safeName = HtmlEncoder.Default.Encode(user.DisplayName);
                var body = $"<p>Merhaba {safeName},</p><p>KOTAKAS şifreni yenilemek için aşağıdaki bağlantıyı kullan:</p><p><a href=\"{HtmlEncoder.Default.Encode(url)}\">Şifremi yenile</a></p><p>Bu talebi sen oluşturmadıysan bağlantıyı kullanma.</p>";
                await emailSender.SendAsync(user.Email!, "KOTAKAS şifre yenileme", body);
            }
            return Results.Ok(new { ok = true, emailDeliveryConfigured = true });
        });

        app.MapPost("/api/auth/reset-password", async (ResetPasswordInput input, UserManager<ApplicationUser> users) =>
        {
            if (string.IsNullOrWhiteSpace(input.UserId) || string.IsNullOrWhiteSpace(input.Token) || (input.NewPassword ?? "").Length < 8)
                return Results.BadRequest(new { error = "invalid_reset_request" });
            var user = await users.FindByIdAsync(input.UserId);
            if (user is null) return Results.BadRequest(new { error = "invalid_reset_request" });
            try
            {
                var decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(input.Token));
                var result = await users.ResetPasswordAsync(user, decoded, input.NewPassword!);
                if (!result.Succeeded) return Results.BadRequest(new { error = "password_reset_failed" });
                await users.UpdateSecurityStampAsync(user);
                return Results.Ok(new { ok = true });
            }
            catch
            {
                return Results.BadRequest(new { error = "password_reset_failed" });
            }
        });

        app.MapGet("/api/auth/providers", (IConfiguration configuration, KotakasEmailSender emailSender) =>
            Results.Ok(new { google = GoogleConfigured(configuration), email = emailSender.IsConfigured }));

        app.MapGet("/auth/google", (IConfiguration configuration) =>
        {
            if (!GoogleConfigured(configuration)) return Results.Redirect("/login.html?oauth=google_not_configured");
            var properties = new AuthenticationProperties { RedirectUri = "/auth/google/callback" };
            return Results.Challenge(properties, new[] { "Google" });
        });

        app.MapGet("/auth/google/callback", async (IConfiguration configuration, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            if (!GoogleConfigured(configuration)) return Results.Redirect("/login.html?oauth=google_not_configured");
            var info = await signIn.GetExternalLoginInfoAsync();
            if (info is null) return Results.Redirect("/login.html?oauth=google_failed");

            var user = await users.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
            var email = info.Principal.FindFirstValue(ClaimTypes.Email)?.Trim().ToLowerInvariant();
            if (user is null && !string.IsNullOrWhiteSpace(email)) user = await users.FindByEmailAsync(email);

            if (user is null)
            {
                if (string.IsNullOrWhiteSpace(email)) return Results.Redirect("/login.html?oauth=google_email_missing");
                var displayName = info.Principal.FindFirstValue(ClaimTypes.Name)?.Trim();
                if (string.IsNullOrWhiteSpace(displayName)) displayName = email.Split('@')[0];
                user = new ApplicationUser { UserName = email, Email = email, DisplayName = displayName, EmailConfirmed = true };
                var created = await users.CreateAsync(user);
                if (!created.Succeeded) return Results.Redirect("/login.html?oauth=google_failed");
                await users.AddToRoleAsync(user, "user");
            }

            if (user.AccountStatus != "active")
            {
                await signIn.SignOutAsync();
                return Results.Redirect("/login.html?oauth=google_suspended");
            }

            var existingLogins = await users.GetLoginsAsync(user);
            if (!existingLogins.Any(x => x.LoginProvider == info.LoginProvider && x.ProviderKey == info.ProviderKey))
            {
                var linked = await users.AddLoginAsync(user, info);
                if (!linked.Succeeded) return Results.Redirect("/login.html?oauth=google_failed");
            }

            if (!user.EmailConfirmed) user.EmailConfirmed = true;
            if (string.IsNullOrWhiteSpace(user.DisplayName))
                user.DisplayName = info.Principal.FindFirstValue(ClaimTypes.Name)?.Trim() ?? user.Email?.Split('@')[0] ?? "KOTAKAS Üyesi";
            await users.UpdateAsync(user);
            await signIn.SignInAsync(user, true);
            return Results.Redirect("/login.html?oauth=success");
        });

        app.MapPost("/api/logout", async (SignInManager<ApplicationUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.Ok(new { ok = true });
        });

        app.MapGet("/api/me", async (ClaimsPrincipal p, UserManager<ApplicationUser> users) =>
        {
            if (!(p.Identity?.IsAuthenticated ?? false)) return Results.Ok(new { user = (object?)null });
            var user = await users.GetUserAsync(p);
            return Results.Ok(new { user = user is null ? null : await ApiHelpers.UserDto(users, user) });
        });
        return app;
    }

    private static async Task SendConfirmationAsync(ApplicationUser user, HttpContext http, UserManager<ApplicationUser> users, KotakasEmailSender emailSender, IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(user.Email)) return;
        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        var encoded = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var baseUrl = PublicBaseUrl(http, configuration);
        var url = $"{baseUrl}/api/auth/confirm-email?uid={Uri.EscapeDataString(user.Id)}&token={Uri.EscapeDataString(encoded)}";
        var safeName = HtmlEncoder.Default.Encode(user.DisplayName);
        var body = $"<p>Merhaba {safeName},</p><p>KOTAKAS hesabını doğrulamak için aşağıdaki bağlantıya dokun:</p><p><a href=\"{HtmlEncoder.Default.Encode(url)}\">E-posta adresimi doğrula</a></p>";
        await emailSender.SendAsync(user.Email, "KOTAKAS e-posta doğrulama", body);
    }

    private static string PublicBaseUrl(HttpContext http, IConfiguration configuration)
    {
        var configured = configuration["PublicBaseUrl"]?.Trim().TrimEnd('/');
        return Uri.TryCreate(configured, UriKind.Absolute, out var uri)
            ? uri.ToString().TrimEnd('/')
            : $"{http.Request.Scheme}://{http.Request.Host}";
    }

    private static bool GoogleConfigured(IConfiguration configuration) =>
        !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"]) &&
        !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientSecret"]);
}

public record RegisterRequest(string? DisplayName, string? Email, string? Password);
public record LoginRequest(string? Email, string? Password);
public record EmailOnlyInput(string? Email);
public record ResetPasswordInput(string? UserId, string? Token, string? NewPassword);
