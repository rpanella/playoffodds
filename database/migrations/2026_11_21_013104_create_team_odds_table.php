<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('team_odds', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('snapshot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('season_team_id')->constrained();
            $table->decimal('p_playoffs', 7, 6);
            $table->decimal('p_division', 7, 6);
            $table->decimal('p_top_seed', 7, 6);
            $table->decimal('p_champion', 7, 6);
            $table->json('p_seed');
            $table->json('p_round');
            $table->decimal('wins_mean', 5, 3);
            $table->unsignedTinyInteger('wins_p10');
            $table->unsignedTinyInteger('wins_p50');
            $table->unsignedTinyInteger('wins_p90');
            $table->json('wins_hist');

            $table->unique(['snapshot_id', 'season_team_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('team_odds');
    }
};
