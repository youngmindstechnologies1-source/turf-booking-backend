class ApiFeatures {
  constructor(query, queryStr) {
    this.query = query;
    this.queryStr = queryStr;
    this.totalCount = 0;
  }

  search() {
    if (this.queryStr.search) {
      const searchRegex = new RegExp(this.queryStr.search, 'i');
      this.query = this.query.find({
        $or: [
          { name: searchRegex },
          { city: searchRegex },
          { description: searchRegex },
        ],
      });
    }
    return this;
  }

  filter() {
    const filterObj = {};

    // Sport filter
    if (this.queryStr.sport) {
      filterObj.sports = { $in: this.queryStr.sport.split(',') };
    }

    // City filter
    if (this.queryStr.city) {
      filterObj.city = this.queryStr.city.toLowerCase();
    }

    // Surface type filter
    if (this.queryStr.surfaceType) {
      filterObj.surfaceType = this.queryStr.surfaceType;
    }

    // Amenities filter
    if (this.queryStr.amenities) {
      filterObj.amenities = { $all: this.queryStr.amenities.split(',') };
    }

    // Price range filter
    if (this.queryStr.minPrice || this.queryStr.maxPrice) {
      filterObj.pricePerHour = {};
      if (this.queryStr.minPrice) {
        filterObj.pricePerHour.$gte = Number(this.queryStr.minPrice);
      }
      if (this.queryStr.maxPrice) {
        filterObj.pricePerHour.$lte = Number(this.queryStr.maxPrice);
      }
    }

    // Status filter
    if (this.queryStr.status) {
      filterObj.status = this.queryStr.status;
    }

    this.query = this.query.find(filterObj);
    return this;
  }

  sort() {
    if (this.queryStr.sort) {
      const sortBy = this.queryStr.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  paginate() {
    const page = parseInt(this.queryStr.page, 10) || 1;
    const limit = parseInt(this.queryStr.limit, 10) || 12;
    const skip = (page - 1) * limit;

    this.page = page;
    this.limit = limit;
    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
}

module.exports = ApiFeatures;
