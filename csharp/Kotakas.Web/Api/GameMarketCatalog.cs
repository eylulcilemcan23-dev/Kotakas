using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public sealed record GameMarketDefinition(
    string Code,
    string Name,
    string DefaultCurrency,
    string[] Currencies,
    string[] ProductTypes);

public static class GameMarketCatalog
{
    public const string DefaultGameCode = "knight-online";
    public const string DefaultProductType = "item";

    public static readonly GameMarketDefinition[] Games =
    [
        new("knight-online", "Knight Online", "GB", ["GB"], ["currency", "item", "character"]),
        new("rise-online", "Rise Online World", "GOLD", ["GOLD"], ["currency", "item", "character"]),
        new("pubg-mobile", "PUBG Mobile", "UC", ["UC"], ["currency", "code"]),
        new("metin2", "Metin2", "WON", ["WON", "YANG"], ["currency", "item", "character"]),
        new("silkroad-online", "Silkroad Online", "GOLD", ["GOLD"], ["currency", "item"]),
        new("valorant", "Valorant", "VP", ["VP"], ["code"]),
        new("league-of-legends", "League of Legends", "RP", ["RP"], ["code"]),
        new("mobile-legends", "Mobile Legends", "DIAMOND", ["DIAMOND"], ["currency", "code"]),
        new("free-fire", "Free Fire", "DIAMOND", ["DIAMOND"], ["currency", "code"]),
        new("world-of-warcraft", "World of Warcraft", "GOLD", ["GOLD"], ["currency", "item"]),
        new("lost-ark", "Lost Ark", "GOLD", ["GOLD"], ["currency", "item"]),
        new("albion-online", "Albion Online", "SILVER", ["SILVER", "GOLD"], ["currency", "item"]),
        new("roblox", "Roblox", "ROBUX", ["ROBUX"], ["currency", "code"]),
        new("fortnite", "Fortnite", "VBUCKS", ["VBUCKS"], ["code"]),
        new("ea-fc", "EA SPORTS FC", "FCPOINTS", ["FCPOINTS"], ["code"]),
        new("steam", "Steam", "WALLET", ["WALLET"], ["code"])
    ];

    public static GameMarketDefinition Resolve(string? gameCode)
    {
        var code = (gameCode ?? "").Trim().ToLowerInvariant();
        return Games.FirstOrDefault(x => x.Code == code) ?? Games[0];
    }

    public static string NormalizeProductType(GameMarketDefinition game, string? productType)
    {
        var raw = (productType ?? "").Trim().ToLowerInvariant();
        raw = raw switch
        {
            "oyun-parasi" or "oyun_parasi" or "money" or "gold" or "gb" or "uc" => "currency",
            "karakter" or "account" => "character",
            "kod" or "gift-code" or "gift_code" => "code",
            _ => raw
        };
        if (game.ProductTypes.Contains(raw, StringComparer.OrdinalIgnoreCase)) return raw;
        return game.ProductTypes.Contains(DefaultProductType, StringComparer.OrdinalIgnoreCase)
            ? DefaultProductType
            : game.ProductTypes[0];
    }

    public static string NormalizeCurrency(GameMarketDefinition game, string? currencyCode)
    {
        var raw = new string((currencyCode ?? "").Trim().ToUpperInvariant()
            .Where(c => char.IsLetterOrDigit(c) || c is '_' or '-').ToArray());
        if (game.Currencies.Contains(raw, StringComparer.OrdinalIgnoreCase)) return raw;
        return game.DefaultCurrency;
    }

    public static string CurrencyLabel(string? currencyCode) => (currencyCode ?? "").ToUpperInvariant() switch
    {
        "VBUCKS" => "V-Bucks",
        "FCPOINTS" => "FC Points",
        "DIAMOND" => "Diamond",
        "ROBUX" => "Robux",
        "WALLET" => "Cüzdan Kodu",
        var x => x
    };

    public static string RateSettingKey(string gameCode, string currencyCode)
        => $"market_rate:{gameCode.Trim().ToLowerInvariant()}:{currencyCode.Trim().ToLowerInvariant()}";

    public static async Task<decimal> UnitTryRate(AppDbContext db, string? gameCode, string? currencyCode)
    {
        var game = Resolve(gameCode);
        var currency = NormalizeCurrency(game, currencyCode);
        if (game.Code == DefaultGameCode && currency == "GB")
            return await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m);
        return await ApiHelpers.SettingDecimal(db, RateSettingKey(game.Code, currency), 0m);
    }

    public static object PublicDto(GameMarketDefinition game) => new
    {
        code = game.Code,
        name = game.Name,
        defaultCurrency = game.DefaultCurrency,
        currencies = game.Currencies.Select(x => new { code = x, label = CurrencyLabel(x) }),
        productTypes = game.ProductTypes
    };
}
