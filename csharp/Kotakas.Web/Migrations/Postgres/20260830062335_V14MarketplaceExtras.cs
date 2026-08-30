using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Kotakas.Web.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class V14MarketplaceExtras : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ListingPriceHistory",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ListingId = table.Column<long>(type: "bigint", nullable: false),
                    PriceGb = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ListingPriceHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ListingPriceHistory_Listings_ListingId",
                        column: x => x.ListingId,
                        principalTable: "Listings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ListingPriceOffer",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ListingId = table.Column<long>(type: "bigint", nullable: false),
                    BuyerUserId = table.Column<string>(type: "text", nullable: false),
                    BuyerName = table.Column<string>(type: "text", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    OfferGbPerUnit = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RespondedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PurchasedDealId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ListingPriceOffer", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ListingPriceOffer_Listings_ListingId",
                        column: x => x.ListingId,
                        principalTable: "Listings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ListingPriceHistory_ListingId_CreatedAt",
                table: "ListingPriceHistory",
                columns: new[] { "ListingId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ListingPriceOffer_BuyerUserId_Status_CreatedAt",
                table: "ListingPriceOffer",
                columns: new[] { "BuyerUserId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ListingPriceOffer_ListingId_BuyerUserId_Status",
                table: "ListingPriceOffer",
                columns: new[] { "ListingId", "BuyerUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ListingPriceOffer_ListingId_Status_ExpiresAt",
                table: "ListingPriceOffer",
                columns: new[] { "ListingId", "Status", "ExpiresAt" });

            migrationBuilder.Sql("""
                INSERT INTO "ListingPriceHistory" ("ListingId", "PriceGb", "Reason", "CreatedAt")
                SELECT l."Id", l."PriceGb", 'initial', l."CreatedAt"
                FROM "Listings" l
                WHERE NOT EXISTS (
                    SELECT 1 FROM "ListingPriceHistory" h WHERE h."ListingId" = l."Id"
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ListingPriceHistory");

            migrationBuilder.DropTable(
                name: "ListingPriceOffer");
        }
    }
}
