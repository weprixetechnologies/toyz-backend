const sampleBlogCategories = [
  { name: 'RC Cars', slug: 'rc-cars', icon: 'Car', sort_order: 1 },
  { name: 'Toy Guides', slug: 'toy-guides', icon: 'Compass', sort_order: 2 },
  { name: 'Play Ideas', slug: 'play-ideas', icon: 'Sparkles', sort_order: 3 },
  { name: 'Parent Tips', slug: 'parent-tips', icon: 'Heart', sort_order: 4 },
  { name: 'Educational Toys', slug: 'educational-toys', icon: 'BookOpen', sort_order: 5 },
  { name: 'News & Updates', slug: 'news-updates', icon: 'Bell', sort_order: 6 }
];

const sampleBlogs = [
  {
    title: 'How to Choose the Best RC Car for Kids',
    slug: 'how-to-choose-the-best-rc-car-for-kids',
    excerpt: 'A complete parent’s guide to picking the right remote control car for kids of every age group, from rugged monster trucks to high-speed drift cars.',
    category_name: 'RC Cars',
    category_slug: 'rc-cars',
    author_name: 'Aarav Sharma',
    reading_time: '6 min read',
    featured_image: 'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=1200&q=80',
    meta_title: 'How to Choose the Best RC Car for Kids — ToyWorld Guide',
    meta_desc: 'Everything parents need to know before buying remote control vehicles: age suitability, battery life, durability, terrain, and safety tips.',
    published_at: '2026-10-10 10:00:00',
    content: `
      <p class="lead text-lg text-gray-700 leading-relaxed font-medium">Remote control (RC) cars have been sparking joy and fascination across generations. Whether your child dreams of conquering bumpy backyard trails with a monster truck or drifting smoothly across hardwood floors, choosing the right vehicle can turn ordinary playtime into an exhilarating thrill ride.</p>

      <h2>Why RC Cars Are Great for Kids</h2>
      <p>Beyond being pure fun, remote control cars offer surprising developmental benefits for growing children:</p>
      <ul>
        <li><strong>Hand-Eye Coordination:</strong> Steering a vehicle moving at high speed requires quick spatial judgment and sharp fine-motor reflexes.</li>
        <li><strong>Outdoor Play Motivation:</strong> An exciting off-road buggy encourages kids to put down their screens, head outside, and explore outdoor parks and trails.</li>
        <li><strong>Basic Engineering Curiosity:</strong> As children play, they intuitively learn about gears, steering mechanisms, battery charging, and aerodynamics.</li>
      </ul>

      <h2>What to Consider Before Buying</h2>
      <p>Not all RC cars are built alike. Here are the crucial elements every parent should inspect before bringing one home:</p>

      <h3>1. Age Suitability & Controller Ergonomics</h3>
      <p>For toddlers (ages 3–5), opt for oversized, durable models with simple two-button remotes (forward/reverse turn). For older kids (ages 8+), pistol-grip 2.4GHz proportional controllers provide realistic steering precision and speed control.</p>

      <h3>2. Vehicle Durability & Crash Resistance</h3>
      <p>Kids love testing limits. Look for shock-absorbing nylon composite chassis, rubber bouncy bumpers, and independent spring suspension to withstand wall bumps and park hurdles.</p>

      <h3>3. Battery Life & Charging Convenience</h3>
      <p>Standard rechargeable lithium batteries typically give 20–30 minutes of runtime. Vehicles with USB-C quick charging or swappable dual battery packs ensure the fun never gets cut short unexpectedly.</p>

      <h3>4. Terrain Compatibility</h3>
      <p>Will your child race primarily indoors on tiles and carpets, or outdoors on gravel, grass, and mud? 4WD (Four-Wheel Drive) monster trucks tackle rugged outdoors with ease, while low-profile drift racers excel on smooth flat surfaces.</p>

      <div class="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-xl my-6 text-amber-900 text-sm">
        <strong>Parent Pro Tip:</strong> If buying for siblings or playgroups, always choose vehicles equipped with <strong>2.4GHz anti-interference radio systems</strong>. This allows multiple cars to race side-by-side without remote signal clashes!
      </div>

      <h2>Frequently Asked Questions</h2>
      <div class="space-y-4 my-6">
        <div>
          <h4 class="font-bold text-gray-900">Are RC cars safe for young children?</h4>
          <p class="text-sm text-gray-600">Yes, provided you choose age-appropriate models with secure screw-locked battery compartments, smooth non-sharp edges, and non-toxic materials.</p>
        </div>
        <div>
          <h4 class="font-bold text-gray-900">How long do batteries usually last?</h4>
          <p class="text-sm text-gray-600">Most consumer RC cars run for 20 to 35 minutes per charge. Many ToyWorld models come with dual modular batteries so you can swap while one recharges.</p>
        </div>
      </div>

      <h2>Conclusion</h2>
      <p>Investing in a well-made RC car provides hours of active, imaginative entertainment. Review our top selections below or browse our full collection to find the ride that matches your child's personality!</p>
    `
  },
  {
    title: '10 Fun & Creative Play Ideas at Home',
    slug: '10-fun-and-creative-play-ideas-at-home',
    excerpt: 'Turn indoor afternoons into memorable family adventures with simple, engaging play activities that spark creativity and laughter without high screen time.',
    category_name: 'Play Ideas',
    category_slug: 'play-ideas',
    author_name: 'Priya Patel',
    reading_time: '5 min read',
    featured_image: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=1200&q=80',
    meta_title: '10 Fun & Creative Indoor Play Ideas at Home — ToyWorld',
    meta_desc: 'Engaging, screen-free play activities to keep children entertained and learning at home using toys, crafts, and imagination.',
    published_at: '2026-10-08 14:30:00',
    content: `
      <p class="lead text-lg text-gray-700 leading-relaxed font-medium">Staying indoors doesn't have to mean endless movie streaming or bored complaints. With a bit of creative thinking, ordinary living rooms transform into bustling space stations, secret jungle hideouts, and high-speed racing circuits.</p>

      <h2>1. The Living Room Grand Prix</h2>
      <p>Use blue painter's tape on tiles or rugs to map out an elaborate racing track with chicanes, pit stops, and finish lines. Kids can race their favorite die-cast vehicles and remote control cars, practicing turn maneuvers and timing laps.</p>

      <h2>2. Mystery Treasure Expedition</h2>
      <p>Hide small toys, colorful puzzle pieces, or action figures around the house. Draft a whimsical map with rhyming clues that test your children's observational skills and problem-solving wit.</p>

      <h2>3. The Ultimate Blanket Fortress</h2>
      <p>Grab cushions, lightweight blankets, and clothespins. Building a secret cave encourages collaborative teamwork, architectural experimentation, and provides a cozy nook for reading storybooks afterwards.</p>

      <h2>4. STEM Domino Cascade Challenge</h2>
      <p>Line up building blocks, books, and dominoes in sprawling spiral sequences. Children learn early physics concepts like kinetic energy, momentum, and patience as they test chain reactions.</p>

      <h2>5. Kitchen Chemist Sensory Lab</h2>
      <p>Combine safe pantry staples like baking soda, food coloring, and vinegar in muffin tins to create bubbling, fizzy volcanoes. Sensory exploration stimulates scientific wonder in curious toddlers.</p>

      <div class="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-xl my-6 text-blue-900 text-sm">
        <strong>Family Tip:</strong> Let your child take the lead as the "Director of Play". When children feel ownership over the game's rules, their engagement and storytelling blossom exponentially.
      </div>

      <h2>Conclusion</h2>
      <p>The best memories are created when parents join into the pretend world with enthusiasm. Keep a curated box of creative toys ready, and playtime will always remain your family's favorite hour of the day.</p>
    `
  },
  {
    title: 'Toy Safety Tips Every Parent Should Know',
    slug: 'toy-safety-tips-every-parent-should-know',
    excerpt: 'Crucial guidelines to evaluate toy safety standards, identify choking hazards, verify non-toxic certifications, and practice safe battery handling.',
    category_name: 'Parent Tips',
    category_slug: 'parent-tips',
    author_name: 'Dr. Neha Varma',
    reading_time: '4 min read',
    featured_image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1200&q=80',
    meta_title: 'Toy Safety Tips Every Parent Should Know — ToyWorld Safety Guide',
    meta_desc: 'Learn how to keep your children safe during playtime with expert tips on material safety, age ratings, and battery care.',
    published_at: '2026-10-05 09:15:00',
    content: `
      <p class="lead text-lg text-gray-700 leading-relaxed font-medium">As parents, nothing matters more than the health and well-being of our little ones. While toys are crafted to inspire delight, keeping safety in focus ensures every play session remains happy and harm-free.</p>

      <h2>1. Respect Age Ratings Closely</h2>
      <p>Age labels are not assessments of a child's intelligence; they are strict safety markers calculated based on choking hazards, motor dexterity, and electrical complexity. Toys labeled 3+ often contain detachable miniature parts that must be kept away from infants.</p>

      <h2>2. Check for Non-Toxic Certifications</h2>
      <p>Look for BIS (Bureau of Indian Standards), CE, and ASTM markings on toy packaging. These certify that plastics are BPA-free, lead-free, and phthalate-free, ensuring materials are safe even if toddlers briefly mouth them.</p>

      <h2>3. The Toilet Paper Roll Choking Test</h2>
      <p>Unsure whether a toy or component is a choking risk for an infant? If it can fit entirely inside the cardboard cylinder of a toilet paper roll without forcing, it is too small for children under 3 years old.</p>

      <h2>4. Secure Battery Enclosures</h2>
      <p>Button cell and lithium batteries present severe hazards if swallowed. Always confirm that battery doors require a Phillips screwdriver to open and inspect toys periodically for cracks or leaks.</p>

      <div class="bg-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-xl my-6 text-emerald-900 text-sm">
        <strong>ToyWorld Quality Promise:</strong> Every single toy in our catalog undergoes rigorous compliance screening and material testing before it reaches our warehouse shelves.
      </div>
    `
  },
  {
    title: 'Exciting New Arrivals at ToyWorld!',
    slug: 'exciting-new-arrivals-at-toyworld',
    excerpt: 'From high-speed amphibious RC racers to brain-teasing wooden 3D puzzles, discover the freshest toys curated to ignite wonder in children of all ages.',
    category_name: 'News & Updates',
    category_slug: 'news-updates',
    author_name: 'ToyWorld Editorial',
    reading_time: '3 min read',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    meta_title: 'Exciting New Arrivals at ToyWorld — Latest 2026 Drops',
    meta_desc: 'Check out the newest toys, remote control cars, and educational kits launched this season at ToyWorld.',
    published_at: '2026-10-02 11:00:00',
    content: `
      <p class="lead text-lg text-gray-700 leading-relaxed font-medium">The ToyWorld collection just received an electrifying seasonal refresh! Our toy scouts have scoured international showcases to bring you groundbreaking gadgets, timeless handcrafted classics, and adrenaline-pumping RC vehicles.</p>

      <h2>Highlights from the 2026 Collection</h2>
      <ul>
        <li><strong>Amphibious All-Terrain Stunt Racers:</strong> Waterproof seals let vehicles seamlessly transition from lawn grass right into backyard swimming pools!</li>
        <li><strong>Solar-Powered Robotics Kits:</strong> 14-in-1 modular builds that teach solar energy conversion and mechanical gear reduction while having blast.</li>
        <li><strong>Magnetic Marble Maze Architecture:</strong> Vertical wall-mounted tracks that turn physics into mesmerizing visual artwork.</li>
      </ul>

      <p>Visit our store or explore online with instant door delivery and safe cash on delivery options across India!</p>
    `
  },
  {
    title: 'The Benefits of Educational Toys for Child Development',
    slug: 'the-benefits-of-educational-toys',
    excerpt: 'Discover how STEM toys, sensory building blocks, and strategy board games enhance early brain development, logical reasoning, and resilience.',
    category_name: 'Educational Toys',
    category_slug: 'educational-toys',
    author_name: 'Meera Sen',
    reading_time: '5 min read',
    featured_image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=1200&q=80',
    meta_title: 'The Benefits of Educational Toys for Child Development — ToyWorld',
    meta_desc: 'How educational toys foster cognitive growth, motor skills, social collaboration, and emotional confidence in children.',
    published_at: '2026-09-28 16:00:00',
    content: `
      <p class="lead text-lg text-gray-700 leading-relaxed font-medium">Children are born natural researchers. In their early years, play is not simply recreation—it is their primary vehicle for decoding how the universe operates. Thoughtfully engineered educational toys accelerate this innate learning process in delightful ways.</p>

      <h2>1. Strengthening Spatial & Mathematical Reasoning</h2>
      <p>When assembling building blocks or interlocking magnetic tiles, children experiment with balance, symmetry, load-bearing geometry, and counting. These hands-on tactile trials lay robust mental foundations for later STEM success.</p>

      <h2>2. Fostering Resilience and Problem-Solving</h2>
      <p>When a block tower tumbles or a puzzle piece won't fit, children experience small, safe micro-frustrations. Figuring out why it failed and attempting a new angle cultivates emotional grit and adaptable analytical thinking.</p>

      <h2>3. Fine and Gross Motor Mastery</h2>
      <p>Threading beads, tightening toy bolts with child-safe screwdrivers, and snapping track joints together refine the pincer grasp and hand dexterity necessary for handwriting, sports, and daily self-care.</p>

      <div class="bg-indigo-50 border-l-4 border-indigo-500 p-5 rounded-r-xl my-6 text-indigo-900 text-sm">
        <strong>The Playful Rule of Thumb:</strong> The best educational toys are 90% child and 10% toy. If the toy does everything with flashing lights and pre-recorded buttons, the child's brain gets to do very little!
      </div>
    `
  },
  {
    title: 'Top 5 RC Cars for 2026: Speed, Durability & Thrills',
    slug: 'top-5-rc-cars-for-2026',
    excerpt: 'Our testing team pushed the latest remote control models across rocky hills, skate parks, and slick roads. Check out our definitive top 5 picks for 2026.',
    category_name: 'RC Cars',
    category_slug: 'rc-cars',
    author_name: 'Aarav Sharma',
    reading_time: '7 min read',
    featured_image: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=1200&q=80',
    meta_title: 'Top 5 RC Cars for 2026 — Tested & Ranked by ToyWorld',
    meta_desc: 'Comprehensive review and ranking of the 5 best RC cars for kids and hobbyists in 2026, comparing speed, battery life, durability, and value.',
    published_at: '2026-09-22 12:00:00',
    content: `
      <p class="lead text-lg text-gray-700 leading-relaxed font-medium">2026 has witnessed remarkable leaps in RC vehicle engineering. Brushless motor efficiency, robust splash-resistant electronics, and precision 2.4GHz transmitters are now accessible at kid-friendly price points. Here are our top 5 tested champions!</p>

      <h2>1. The High Performance RC Monster Truck (Editor’s Choice)</h2>
      <p>Equipped with oversized treaded pneumatic tires and independent coil-over suspension, this beast powers over tall grass, steep dirt mounds, and gravel without breaking a sweat. It hits speeds up to 25 km/h while remaining completely manageable for young pilots.</p>

      <h2>2. The Precision Drift Racing Specialist</h2>
      <p>Engineered for lovers of sleek supercars and asphalt acrobatics, this low-slung drifter features smooth hard-compound tires and an electronic gyro for executing cinematic 360-degree power slides on flat pavement.</p>

      <h2>3. The Amphibious Land & Water Hydro-Racer</h2>
      <p>Why stop at the edge of the puddle? With a sealed waterproof hull and paddle-tread wheels, this unique marvel drives across muddy lawns, plunges into the pool, and steers across water like a miniature motorboat!</p>

      <h2>4. The Rock Crawler 4WD Mountain Climber</h2>
      <p>If your child prefers patient, calculated tactical driving over breakneck straightaway speed, high-torque rock crawlers conquer 45-degree rocky inclines with mesmerizing articulation and balance.</p>

      <h2>5. The High Speed RC Racing Boat</h2>
      <p>For lakeside weekends and pool parties, water-cooled dual motors and auto-righting flip recovery ensure high-adrenaline aquatic racing with zero fear of capsizing.</p>

      <div class="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-xl my-6 text-red-900 text-sm">
        <strong>Holiday Warning:</strong> RC vehicles consistently rank among the most requested gift items every season. Make sure to order early to secure popular color options!
      </div>
    `
  }
];

async function seedBlogs(db) {
  try {
    for (const cat of sampleBlogCategories) {
      await db.query(
        `INSERT INTO blog_categories (name, slug, icon, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)`,
        [cat.name, cat.slug, cat.icon, cat.sort_order]
      );
    }

    for (const b of sampleBlogs) {
      await db.query(
        `INSERT INTO blogs (title, slug, excerpt, content, featured_image, category_name, category_slug, author_name, reading_time, is_published, published_at, meta_title, meta_desc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), excerpt = VALUES(excerpt), content = VALUES(content), featured_image = VALUES(featured_image), category_name = VALUES(category_name), category_slug = VALUES(category_slug), reading_time = VALUES(reading_time)`,
        [b.title, b.slug, b.excerpt, b.content, b.featured_image, b.category_name, b.category_slug, b.author_name, b.reading_time, b.published_at, b.meta_title, b.meta_desc]
      );
    }
    console.log('[DB Init] Blog categories and sample articles seeded successfully.');
  } catch (err) {
    console.error('[DB Init Error] Failed to seed blogs:', err.message);
  }
}

module.exports = {
  sampleBlogCategories,
  sampleBlogs,
  seedBlogs
};
