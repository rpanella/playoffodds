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
        Schema::create('snapshot_standings', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('snapshot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('season_team_id')->constrained();
            $table->unsignedTinyInteger('wins');
            $table->unsignedTinyInteger('losses');
            $table->unsignedTinyInteger('ties');
            $table->decimal('win_pct', 4, 3);
            $table->unsignedTinyInteger('division_rank');
            $table->unsignedTinyInteger('conference_rank');
            // Seed if the season ended now; null outside the playoff spots.
            $table->unsignedTinyInteger('seed')->nullable();
            // Division and conference records, points for and against, division winner.
            $table->json('extras');

            $table->unique(['snapshot_id', 'season_team_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('snapshot_standings');
    }
};
